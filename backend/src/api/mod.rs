use crate::config::{AppConfig, SandboxMode};
use crate::engines::container_runner::run_sandboxed_command;
use crate::engines::EngineCapabilities;
use crate::error::AppError;
use crate::formats::graph::{CompatibilityGraph, ConversionPlan, GraphExport};
use crate::formats::options::{ConversionOptions, LayoutMode};
use crate::formats::{Format, WorkloadWeight};
use crate::queue::{EnqueueRequest, JobScheduler, JobStatus, QueueMetrics};
use crate::security::validator::{sanitize_filename, verify_file_magic};
use crate::security::zip_guard::{inspect_zip, validate_7z_listing, ArchiveInspection};
use axum::{
    body::Body,
    extract::{Multipart, Path as AxumPath, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

pub struct AppState {
    pub cfg: AppConfig,
    pub graph: CompatibilityGraph,
    pub caps: EngineCapabilities,
    pub scheduler: Arc<JobScheduler>,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/v1/health", get(health_handler))
        .route("/api/v1/formats/graph", get(graph_handler))
        .route("/api/v1/plan", get(plan_handler))
        .route("/api/v1/archive/inspect", post(inspect_archive_handler))
        .route("/api/v1/convert", post(convert_handler))
        .route("/api/v1/jobs/{id}", get(job_status_handler))
        .route("/api/v1/jobs/{id}/download", get(job_download_handler))
        .with_state(state)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    sandbox_mode: SandboxMode,
    max_upload_mb: usize,
    engines: EngineCapabilities,
    queues: QueueMetrics,
}

async fn health_handler(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let queues = state.scheduler.metrics().await;
    Json(HealthResponse {
        status: "ok",
        sandbox_mode: state.cfg.sandbox_mode,
        max_upload_mb: state.cfg.max_upload_bytes / (1024 * 1024),
        engines: state.caps.clone(),
        queues,
    })
}

async fn graph_handler(State(state): State<Arc<AppState>>) -> Json<GraphExport> {
    Json(state.graph.export_for_ui())
}

#[derive(Deserialize)]
struct PlanQuery {
    from: String,
    to: String,
    #[serde(default)]
    layout: LayoutMode,
}

async fn plan_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<PlanQuery>,
) -> Result<Json<ConversionPlan>, AppError> {
    let from = Format::from_ext(&q.from)
        .ok_or_else(|| AppError::BadRequest(format!("Unknown source format '{}'", q.from)))?;
    let to = Format::from_ext(&q.to)
        .ok_or_else(|| AppError::BadRequest(format!("Unknown target format '{}'", q.to)))?;

    let plan = state.graph.plan(from, to, q.layout).ok_or_else(|| {
        AppError::UnsupportedConversion(format!(
            "No conversion path exists between {} and {}",
            from.extension().to_uppercase(),
            to.extension().to_uppercase()
        ))
    })?;

    Ok(Json(plan))
}

#[derive(Serialize)]
struct ConvertResponse {
    job_id: Uuid,
    lane: WorkloadWeight,
    plan: ConversionPlan,
    warnings: Vec<String>,
}

async fn convert_handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ConvertResponse>), AppError> {
    let job_id = Uuid::new_v4();
    let job_dir = state.cfg.work_dir.join(job_id.to_string());
    fs::create_dir_all(&job_dir).map_err(|e| AppError::Internal(e.to_string()))?;

    // RAII cleanup if validation fails before job is accepted into scheduler
    let mut cleanup_on_drop = Some(job_dir.clone());

    let result = process_multipart_convert(&state, job_id, &job_dir, &mut multipart).await;
    if result.is_ok() {
        cleanup_on_drop = None;
    }
    if let Some(dir) = cleanup_on_drop {
        let _ = fs::remove_dir_all(dir);
    }

    result.map(|resp| (StatusCode::ACCEPTED, Json(resp)))
}

async fn process_multipart_convert(
    state: &Arc<AppState>,
    job_id: Uuid,
    job_dir: &std::path::Path,
    multipart: &mut Multipart,
) -> Result<ConvertResponse, AppError> {
    let mut source_ext: Option<String> = None;
    let mut target_ext: Option<String> = None;
    let mut options_json: Option<String> = None;
    let mut original_filename: String = "upload".to_string();
    let mut uploaded_path: Option<PathBuf> = None;
    let mut uploaded_bytes: u64 = 0;
    let mut header_sample: Vec<u8> = Vec::with_capacity(4096);

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {e}")))?
    {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "source_format" => {
                source_ext = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "target_format" => {
                target_ext = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "options" => {
                options_json = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "file" => {
                if let Some(fname) = field.file_name() {
                    original_filename = sanitize_filename(fname);
                }
                let raw_path = job_dir.join("raw_upload.bin");
                let mut f = tokio::fs::File::create(&raw_path)
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;

                while let Some(chunk) = field
                    .chunk()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Upload stream error: {e}")))?
                {
                    uploaded_bytes = uploaded_bytes.saturating_add(chunk.len() as u64);
                    if uploaded_bytes > state.cfg.max_upload_bytes as u64 {
                        return Err(AppError::PayloadTooLarge);
                    }
                    if header_sample.len() < 4096 {
                        let take = (4096 - header_sample.len()).min(chunk.len());
                        header_sample.extend_from_slice(&chunk[..take]);
                    }
                    f.write_all(&chunk)
                        .await
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                }
                f.flush()
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                uploaded_path = Some(raw_path);
            }
            _ => {}
        }
    }

    let raw_upload = uploaded_path
        .ok_or_else(|| AppError::BadRequest("Missing required 'file' field".to_string()))?;

    let inferred_ext = source_ext.unwrap_or_else(|| {
        PathBuf::from(&original_filename)
            .extension()
            .map(|e| e.to_string_lossy().into_owned())
            .unwrap_or_default()
    });

    let from_fmt = Format::from_ext(&inferred_ext).ok_or_else(|| {
        AppError::BadRequest(format!("Unsupported source format '{inferred_ext}'"))
    })?;
    let to_fmt_str = target_ext
        .ok_or_else(|| AppError::BadRequest("Missing 'target_format' field".to_string()))?;
    let to_fmt = Format::from_ext(&to_fmt_str).ok_or_else(|| {
        AppError::BadRequest(format!("Unsupported target format '{to_fmt_str}'"))
    })?;

    // Magic-byte verification against declared source format
    verify_file_magic(&header_sample, from_fmt)?;

    let options: ConversionOptions = match options_json {
        Some(raw) if !raw.trim().is_empty() => serde_json::from_str::<ConversionOptions>(&raw)
            .map_err(|e| AppError::BadRequest(format!("Invalid options JSON: {e}")))?
            .sanitized(),
        _ => ConversionOptions::default(),
    };

    let plan = state
        .graph
        .plan(from_fmt, to_fmt, options.layout_mode)
        .ok_or_else(|| {
            AppError::UnsupportedConversion(format!(
                "Impossible or unsupported conversion: {} -> {}",
                from_fmt.extension().to_uppercase(),
                to_fmt.extension().to_uppercase()
            ))
        })?;

    // Check required engines in plan
    let mut warnings = Vec::new();
    for step in &plan.steps {
        if !state.caps.is_engine_available(step.engine, &state.cfg) {
            return Err(AppError::EngineUnavailable(
                step.engine.display_name().to_string(),
            ));
        }
        if matches!(step.fidelity, crate::formats::graph::FidelityProfile::Lossy) {
            warnings.push(format!(
                "Step {} -> {} uses lossy conversion ({})",
                step.from, step.to, step.note
            ));
        }
    }

    // Rename raw_upload.bin to strict UUID-safe `input.<ext>` inside job_dir
    let input_path = job_dir.join(format!("input.{}", from_fmt.extension()));
    fs::rename(&raw_upload, &input_path).map_err(|e| AppError::Internal(e.to_string()))?;

    let lane = state
        .scheduler
        .enqueue(EnqueueRequest {
            job_id,
            work_dir: job_dir.to_path_buf(),
            input_path,
            original_filename: &original_filename,
            input_bytes: uploaded_bytes,
            plan: plan.clone(),
            options,
        })
        .await?;

    Ok(ConvertResponse {
        job_id,
        lane,
        plan,
        warnings,
    })
}

async fn inspect_archive_handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<ArchiveInspection>, AppError> {
    let temp_dir = tempfile::Builder::new()
        .prefix("omnimorph_inspect_")
        .tempdir_in(&state.cfg.work_dir)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut filename = "archive.zip".to_string();
    let mut password: Option<String> = None;
    let mut file_path: Option<PathBuf> = None;
    let mut header_sample = Vec::with_capacity(2048);
    let mut total_bytes: u64 = 0;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        match field.name().unwrap_or_default() {
            "password" => {
                let pw = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                if !pw.is_empty() && pw.len() <= 256 && !pw.contains('\0') {
                    password = Some(pw);
                }
            }
            "file" => {
                if let Some(fname) = field.file_name() {
                    filename = sanitize_filename(fname);
                }
                let p = temp_dir.path().join("inspect.bin");
                let mut f = tokio::fs::File::create(&p)
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                while let Some(chunk) = field
                    .chunk()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?
                {
                    total_bytes = total_bytes.saturating_add(chunk.len() as u64);
                    if total_bytes > state.cfg.max_upload_bytes as u64 {
                        return Err(AppError::PayloadTooLarge);
                    }
                    if header_sample.len() < 2048 {
                        let take = (2048 - header_sample.len()).min(chunk.len());
                        header_sample.extend_from_slice(&chunk[..take]);
                    }
                    f.write_all(&chunk)
                        .await
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                }
                file_path = Some(p);
            }
            _ => {}
        }
    }

    let path = file_path.ok_or_else(|| AppError::BadRequest("Missing archive file".to_string()))?;
    let ext = PathBuf::from(&filename)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    let fmt = Format::from_ext(&ext)
        .ok_or_else(|| AppError::BadRequest(format!("Unsupported archive format '{ext}'")))?;
    verify_file_magic(&header_sample, fmt)?;

    if fmt == Format::Zip || fmt == Format::Cbz {
        let cfg = state.cfg.clone();
        let inspection = tokio::task::spawn_blocking(move || inspect_zip(&path, &cfg))
            .await
            .map_err(|e| AppError::Internal(e.to_string()))??;
        return Ok(Json(inspection));
    }

    if !state.caps.seven_zip && !state.caps.docker_available {
        return Err(AppError::EngineUnavailable("7-Zip".to_string()));
    }

    let mut args = vec!["l".to_string(), "-slt".to_string()];
    if let Some(pw) = password {
        args.push(format!("-p{pw}"));
    } else {
        args.push("-p".to_string());
    }
    args.push("--".to_string());
    args.push(path.file_name().unwrap().to_string_lossy().into_owned());

    let out = run_sandboxed_command(
        "7z",
        &args,
        temp_dir.path(),
        &state.cfg,
        state.caps.docker_available,
        30,
        false,
    )
    .await?;

    let inspection = validate_7z_listing(&out.stdout, &state.cfg)?;
    Ok(Json(inspection))
}

#[derive(Serialize)]
struct JobStatusResponse {
    job_id: Uuid,
    plan: ConversionPlan,
    #[serde(flatten)]
    status: JobStatus,
}

async fn job_status_handler(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<Uuid>,
) -> Result<Json<JobStatusResponse>, AppError> {
    let rec = state
        .scheduler
        .get_job(id)
        .await
        .ok_or(AppError::NotFound)?;

    Ok(Json(JobStatusResponse {
        job_id: rec.id,
        plan: rec.plan,
        status: rec.status,
    }))
}

async fn job_download_handler(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<Uuid>,
) -> Result<Response, AppError> {
    let rec = state
        .scheduler
        .get_job(id)
        .await
        .ok_or(AppError::NotFound)?;

    let (output_filename, output_mime) = match &rec.status {
        JobStatus::Completed {
            output_filename,
            output_mime,
            ..
        } => (output_filename.clone(), output_mime.clone()),
        _ => {
            return Err(AppError::BadRequest(
                "Conversion job is not yet completed".to_string(),
            ));
        }
    };

    let output_path = rec.output_path.ok_or(AppError::NotFound)?;
    let bytes = tokio::fs::read(&output_path)
        .await
        .map_err(|_| AppError::NotFound)?;

    let safe_name = sanitize_filename(&output_filename);
    let disposition = format!("attachment; filename=\"{safe_name}\"");

    let mut resp = Response::new(Body::from(bytes));
    let headers = resp.headers_mut();
    if let Ok(ct) = HeaderValue::from_str(&output_mime) {
        headers.insert(header::CONTENT_TYPE, ct);
    }
    if let Ok(cd) = HeaderValue::from_str(&disposition) {
        headers.insert(header::CONTENT_DISPOSITION, cd);
    }
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    // Sandbox CSP prevents uploaded HTML/SVG downloads from running scripts on our origin!
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; sandbox"),
    );

    Ok(resp)
}
