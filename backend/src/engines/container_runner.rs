use crate::config::{AppConfig, SandboxMode};
use crate::error::AppError;
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
}

/// Runs an external engine command with strict security isolation:
/// - Never invokes a shell (`sh -c` / `cmd /C`)
/// - When `DockerPreferred` (with Docker available) or `DockerStrict` is active, wraps
///   execution in an ephemeral, network-isolated (`--network=none`), capability-dropped
///   (`--cap-drop=ALL`), read-only-root container with CPU/RAM/PID caps.
/// - Otherwise uses hardened host subprocess isolation (`env_clear()`, confined `HOME`/cwd,
///   and `kill_on_drop(true)` timeout enforcement).
pub async fn run_sandboxed_command(
    binary: &str,
    args: &[String],
    work_dir: &Path,
    cfg: &AppConfig,
    docker_available: bool,
    timeout_secs: u64,
    enable_gpu: bool,
) -> Result<CommandOutput, AppError> {
    let use_docker = match cfg.sandbox_mode {
        SandboxMode::DockerStrict => {
            if !docker_available {
                return Err(AppError::EngineUnavailable("docker".to_string()));
            }
            true
        }
        SandboxMode::DockerPreferred => docker_available,
        SandboxMode::ProcessIsolated => false,
    };

    let mut cmd = if use_docker {
        let mut c = Command::new("docker");
        let mount_spec = format!("{}:/work:rw", work_dir.to_string_lossy());
        let pids = cfg.container_pids_limit.to_string();

        c.arg("run")
            .arg("--rm")
            .arg("--network=none")
            .arg("--read-only")
            .arg("--tmpfs")
            .arg("/tmp:rw,noexec,nosuid,size=512m")
            .arg("--cap-drop=ALL")
            .arg("--security-opt=no-new-privileges:true")
            .arg("--pids-limit")
            .arg(&pids)
            .arg("--memory")
            .arg(&cfg.container_memory_limit)
            .arg("--cpus")
            .arg(&cfg.container_cpu_limit)
            .arg("-v")
            .arg(&mount_spec)
            .arg("-w")
            .arg("/work");

        if enable_gpu {
            c.arg("--gpus").arg("all");
        }

        c.arg(&cfg.docker_worker_image).arg(binary).args(args);
        c
    } else {
        let mut c = Command::new(binary);
        // Clear host environment variables (secrets, tokens, cloud keys) before launching engine!
        c.env_clear();
        if let Ok(path_val) = std::env::var("PATH") {
            c.env("PATH", path_val);
        }
        c.env("HOME", work_dir);
        c.env("TMPDIR", work_dir);
        c.env("LANG", "C.UTF-8");
        c.current_dir(work_dir);
        c.args(args);
        c
    };

    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        cmd.output(),
    )
    .await
    .map_err(|_| AppError::Timeout)?
    .map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::EngineUnavailable(binary.to_string())
        } else {
            AppError::ProcessingFailed(format!("Failed to start engine '{binary}': {e}"))
        }
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        return Err(AppError::ProcessingFailed(format!(
            "Engine '{binary}' exited with status {:?}: {}",
            output.status.code(),
            stderr.chars().take(600).collect::<String>()
        )));
    }

    Ok(CommandOutput { stdout, stderr })
}
