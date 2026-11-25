#![forbid(unsafe_code)]

use omnimorph_backend::api::{self, AppState};
use omnimorph_backend::config::AppConfig;
use omnimorph_backend::engines::EngineCapabilities;
use omnimorph_backend::formats::graph::CompatibilityGraph;
use omnimorph_backend::queue::JobScheduler;
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method};
use std::fs;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("omnimorph_backend=info,tower_http=info")),
        )
        .init();

    let cfg = AppConfig::from_env();
    fs::create_dir_all(&cfg.work_dir).expect("failed to initialize isolated job work directory");

    tracing::info!("Probing host engines & GPU acceleration capabilities...");
    let caps = EngineCapabilities::probe().await;
    tracing::info!(?caps, sandbox = ?cfg.sandbox_mode, "OmniMorph engine probe complete");

    let graph = CompatibilityGraph::build();
    let scheduler = JobScheduler::start(cfg.clone(), caps.clone());

    let state = Arc::new(AppState {
        cfg: cfg.clone(),
        graph,
        caps,
        scheduler,
    });

    let cors = if cfg.allow_cors_origin == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers([header::CONTENT_TYPE])
    } else if let Ok(origin) = HeaderValue::from_str(&cfg.allow_cors_origin) {
        CorsLayer::new()
            .allow_origin(origin)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers([header::CONTENT_TYPE])
    } else {
        CorsLayer::new()
    };

    let mut app = api::router(state)
        .layer(DefaultBodyLimit::max(cfg.max_upload_bytes))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ));

    if cfg.static_dir.exists() {
        let index = cfg.static_dir.join("index.html");
        let serve = ServeDir::new(&cfg.static_dir).not_found_service(ServeFile::new(index));
        app = app.fallback_service(serve);
        tracing::info!(dir = %cfg.static_dir.display(), "Serving compiled frontend UI");
    } else {
        tracing::warn!(
            dir = %cfg.static_dir.display(),
            "Static frontend directory not found; serving API endpoints only"
        );
    }

    let listener = tokio::net::TcpListener::bind(&cfg.listen_addr)
        .await
        .expect("failed to bind TCP listener");
    tracing::info!(addr = %cfg.listen_addr, "OmniMorph Rust backend listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server exited with error");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("Shutdown signal received, draining server...");
}
