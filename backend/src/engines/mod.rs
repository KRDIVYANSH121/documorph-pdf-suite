pub mod cli_adapters;
pub mod container_runner;
pub mod native_rust;

use crate::config::AppConfig;
use crate::error::AppError;
use crate::formats::graph::EngineId;
use crate::formats::options::ConversionOptions;
use crate::formats::Format;
use serde::Serialize;
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct EngineCapabilities {
    pub docker_available: bool,
    pub ffmpeg: bool,
    pub nvenc_gpu: bool,
    pub vaapi_gpu: bool,
    pub libreoffice: bool,
    pub pandoc: bool,
    pub imagemagick: bool,
    pub inkscape: bool,
    pub calibre: bool,
    pub seven_zip: bool,
    pub fonttools: bool,
    pub assimp: bool,
    pub duckdb: bool,
}

impl EngineCapabilities {
    pub async fn probe() -> Self {
        let (
            docker_available,
            ffmpeg,
            libreoffice,
            pandoc,
            imagemagick,
            inkscape,
            calibre,
            seven_zip,
            fonttools,
            assimp,
            duckdb,
        ) = tokio::join!(
            cmd_exists("docker", &["--version"]),
            cmd_exists("ffmpeg", &["-version"]),
            cmd_exists("soffice", &["--version"]),
            cmd_exists("pandoc", &["--version"]),
            cmd_exists("magick", &["--version"]),
            cmd_exists("inkscape", &["--version"]),
            cmd_exists("ebook-convert", &["--version"]),
            cmd_exists("7z", &["i"]),
            cmd_exists("woff2_compress", &["-h"]),
            cmd_exists("assimp", &["version"]),
            cmd_exists("duckdb", &["--version"]),
        );

        let (nvenc_gpu, vaapi_gpu) = if ffmpeg {
            probe_ffmpeg_hwaccel().await
        } else {
            (false, false)
        };

        Self {
            docker_available,
            ffmpeg,
            nvenc_gpu,
            vaapi_gpu,
            libreoffice,
            pandoc,
            imagemagick,
            inkscape,
            calibre,
            seven_zip,
            fonttools,
            assimp,
            duckdb,
        }
    }

    pub fn is_engine_available(&self, engine: EngineId, cfg: &AppConfig) -> bool {
        if matches!(cfg.sandbox_mode, crate::config::SandboxMode::DockerStrict) {
            return engine == EngineId::NativeRust || self.docker_available;
        }
        match engine {
            EngineId::NativeRust => true,
            EngineId::FFmpeg => self.ffmpeg || self.docker_available,
            EngineId::LibreOffice => self.libreoffice || self.docker_available,
            EngineId::Pandoc => self.pandoc || self.docker_available,
            EngineId::ImageMagick => self.imagemagick || self.docker_available,
            EngineId::Inkscape => self.inkscape || self.docker_available,
            EngineId::Calibre => self.calibre || self.docker_available,
            EngineId::SevenZip => self.seven_zip || self.docker_available,
            EngineId::FontTools => self.fonttools || self.docker_available,
            EngineId::AssimpCad => self.assimp || self.docker_available,
            EngineId::DataBridge => self.duckdb || self.docker_available,
        }
    }
}

async fn cmd_exists(bin: &str, args: &[&str]) -> bool {
    let mut cmd = Command::new(bin);
    cmd.args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    matches!(
        tokio::time::timeout(std::time::Duration::from_secs(3), cmd.status()).await,
        Ok(Ok(_))
    )
}

async fn probe_ffmpeg_hwaccel() -> (bool, bool) {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-encoders"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    if let Ok(Ok(out)) =
        tokio::time::timeout(std::time::Duration::from_secs(3), cmd.output()).await
    {
        let text = String::from_utf8_lossy(&out.stdout);
        return (text.contains("h264_nvenc"), text.contains("h264_vaapi"));
    }
    (false, false)
}

pub struct StepExecParams<'a> {
    pub engine: EngineId,
    pub from: Format,
    pub to: Format,
    pub input_path: &'a Path,
    pub output_path: &'a Path,
    pub work_dir: &'a Path,
    pub options: &'a ConversionOptions,
    pub cfg: &'a AppConfig,
    pub caps: &'a EngineCapabilities,
    pub timeout_secs: u64,
}

pub async fn execute_step(params: StepExecParams<'_>) -> Result<(), AppError> {
    match params.engine {
        EngineId::NativeRust => {
            let from = params.from;
            let to = params.to;
            let input = params.input_path.to_path_buf();
            let output = params.output_path.to_path_buf();
            let work_dir = params.work_dir.to_path_buf();
            let options = params.options.clone();
            let cfg = params.cfg.clone();

            tokio::time::timeout(
                std::time::Duration::from_secs(params.timeout_secs),
                tokio::task::spawn_blocking(move || {
                    native_rust::convert_native(&input, &output, from, to, &work_dir, &options, &cfg)
                }),
            )
            .await
            .map_err(|_| AppError::Timeout)?
            .map_err(|e| AppError::Internal(format!("Worker join error: {e}")))?
        }
        _ => cli_adapters::execute_cli_engine(params).await,
    }
}
