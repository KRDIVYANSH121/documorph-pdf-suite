use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct AppConfig {
    pub listen_addr: String,
    pub static_dir: PathBuf,
    pub work_dir: PathBuf,
    pub max_upload_bytes: usize,
    pub max_uncompressed_bytes: u64,
    pub max_compression_ratio: u64,
    pub max_archive_entries: usize,
    pub max_archive_depth: u8,
    pub lightweight_workers: usize,
    pub heavy_workers: usize,
    pub lightweight_timeout_secs: u64,
    pub heavy_timeout_secs: u64,
    pub job_ttl_secs: u64,
    pub sandbox_mode: SandboxMode,
    pub docker_worker_image: String,
    pub container_memory_limit: String,
    pub container_cpu_limit: String,
    pub container_pids_limit: u32,
    pub allow_cors_origin: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxMode {
    /// Execute engines inside ephemeral `--network=none` Docker containers when available.
    DockerPreferred,
    /// Require Docker isolation and refuse host subprocess execution.
    DockerStrict,
    /// Hardened direct subprocess execution (env_clear, isolated per-job tempdir, strict timeouts).
    ProcessIsolated,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let sandbox_mode = match std::env::var("OMNIMORPH_SANDBOX_MODE")
            .unwrap_or_else(|_| "docker_preferred".to_string())
            .to_lowercase()
            .as_str()
        {
            "docker_strict" => SandboxMode::DockerStrict,
            "process_isolated" => SandboxMode::ProcessIsolated,
            _ => SandboxMode::DockerPreferred,
        };

        Self {
            listen_addr: std::env::var("OMNIMORPH_LISTEN")
                .unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
            static_dir: PathBuf::from(
                std::env::var("OMNIMORPH_STATIC_DIR").unwrap_or_else(|_| "../dist".to_string()),
            ),
            work_dir: PathBuf::from(
                std::env::var("OMNIMORPH_WORK_DIR")
                    .unwrap_or_else(|_| std::env::temp_dir().join("omnimorph_jobs").to_string_lossy().into_owned()),
            ),
            max_upload_bytes: env_usize("OMNIMORPH_MAX_UPLOAD_MB", 250) * 1024 * 1024,
            max_uncompressed_bytes: (env_usize("OMNIMORPH_MAX_UNCOMPRESSED_MB", 1024) as u64)
                * 1024
                * 1024,
            max_compression_ratio: env_usize("OMNIMORPH_MAX_RATIO", 100) as u64,
            max_archive_entries: env_usize("OMNIMORPH_MAX_ARCHIVE_ENTRIES", 5000),
            max_archive_depth: env_usize("OMNIMORPH_MAX_ARCHIVE_DEPTH", 3) as u8,
            lightweight_workers: env_usize("OMNIMORPH_LIGHT_WORKERS", 4).max(1),
            heavy_workers: env_usize("OMNIMORPH_HEAVY_WORKERS", 2).max(1),
            lightweight_timeout_secs: env_usize("OMNIMORPH_LIGHT_TIMEOUT_SECS", 45) as u64,
            heavy_timeout_secs: env_usize("OMNIMORPH_HEAVY_TIMEOUT_SECS", 300) as u64,
            job_ttl_secs: env_usize("OMNIMORPH_JOB_TTL_SECS", 1800) as u64,
            sandbox_mode,
            docker_worker_image: std::env::var("OMNIMORPH_WORKER_IMAGE")
                .unwrap_or_else(|_| "omnimorph-worker:latest".to_string()),
            container_memory_limit: std::env::var("OMNIMORPH_CONTAINER_MEM")
                .unwrap_or_else(|_| "2g".to_string()),
            container_cpu_limit: std::env::var("OMNIMORPH_CONTAINER_CPUS")
                .unwrap_or_else(|_| "2.0".to_string()),
            container_pids_limit: env_usize("OMNIMORPH_CONTAINER_PIDS", 128) as u32,
            allow_cors_origin: std::env::var("OMNIMORPH_CORS_ORIGIN")
                .unwrap_or_else(|_| "*".to_string()),
        }
    }
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(default)
}
