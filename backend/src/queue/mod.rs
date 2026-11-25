use crate::config::AppConfig;
use crate::engines::{execute_step, EngineCapabilities, StepExecParams};
use crate::error::AppError;
use crate::formats::graph::{ConversionPlan, EngineId};
use crate::formats::options::ConversionOptions;
use crate::formats::WorkloadWeight;
use crate::security::validator::sanitize_filename;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, RwLock, Semaphore};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum JobStatus {
    Queued {
        lane: WorkloadWeight,
    },
    Running {
        lane: WorkloadWeight,
        current_step: usize,
        total_steps: usize,
        step_label: String,
    },
    Completed {
        lane: WorkloadWeight,
        output_filename: String,
        output_mime: String,
        output_size: u64,
        sha256: String,
        elapsed_ms: u64,
    },
    Failed {
        lane: WorkloadWeight,
        reason: String,
    },
}

#[derive(Debug, Clone)]
pub struct JobRecord {
    pub id: Uuid,
    pub work_dir: PathBuf,
    pub output_path: Option<PathBuf>,
    pub plan: ConversionPlan,
    pub status: JobStatus,
    pub created_at: Instant,
}

struct QueuedTask {
    job_id: Uuid,
    input_path: PathBuf,
    output_stem: String,
    plan: ConversionPlan,
    options: ConversionOptions,
    lane: WorkloadWeight,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueMetrics {
    pub lightweight_pending: usize,
    pub heavy_pending: usize,
    pub total_tracked_jobs: usize,
}

pub struct JobScheduler {
    cfg: AppConfig,
    caps: EngineCapabilities,
    jobs: RwLock<HashMap<Uuid, JobRecord>>,
    light_tx: mpsc::Sender<QueuedTask>,
    heavy_tx: mpsc::Sender<QueuedTask>,
    light_pending: AtomicUsize,
    heavy_pending: AtomicUsize,
}

impl JobScheduler {
    pub fn start(cfg: AppConfig, caps: EngineCapabilities) -> Arc<Self> {
        let (light_tx, mut light_rx) = mpsc::channel::<QueuedTask>(200);
        let (heavy_tx, mut heavy_rx) = mpsc::channel::<QueuedTask>(100);

        let scheduler = Arc::new(Self {
            cfg: cfg.clone(),
            caps,
            jobs: RwLock::new(HashMap::new()),
            light_tx,
            heavy_tx,
            light_pending: AtomicUsize::new(0),
            heavy_pending: AtomicUsize::new(0),
        });

        // Lightweight lane dispatcher
        let light_sched = Arc::clone(&scheduler);
        let light_sem = Arc::new(Semaphore::new(cfg.lightweight_workers));
        tokio::spawn(async move {
            while let Some(task) = light_rx.recv().await {
                let permit = light_sem.clone().acquire_owned().await;
                let s = Arc::clone(&light_sched);
                tokio::spawn(async move {
                    let _permit = permit;
                    s.light_pending.fetch_sub(1, Ordering::Relaxed);
                    s.run_task(task).await;
                });
            }
        });

        // Heavy lane dispatcher (isolated from lightweight queue so 4K video never stalls docs)
        let heavy_sched = Arc::clone(&scheduler);
        let heavy_sem = Arc::new(Semaphore::new(cfg.heavy_workers));
        tokio::spawn(async move {
            while let Some(task) = heavy_rx.recv().await {
                let permit = heavy_sem.clone().acquire_owned().await;
                let s = Arc::clone(&heavy_sched);
                tokio::spawn(async move {
                    let _permit = permit;
                    s.heavy_pending.fetch_sub(1, Ordering::Relaxed);
                    s.run_task(task).await;
                });
            }
        });

        // Background TTL cleanup janitor
        let janitor_sched = Arc::clone(&scheduler);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                janitor_sched.evict_expired().await;
            }
        });

        scheduler
    }

    pub fn classify_lane(plan: &ConversionPlan, input_bytes: u64) -> WorkloadWeight {
        if input_bytes > 15 * 1024 * 1024 {
            return WorkloadWeight::Heavy;
        }
        if plan.source.default_weight() == WorkloadWeight::Heavy
            || plan.target.default_weight() == WorkloadWeight::Heavy
        {
            return WorkloadWeight::Heavy;
        }
        if plan.steps.iter().any(|s| s.engine != EngineId::NativeRust) {
            return WorkloadWeight::Heavy;
        }
        WorkloadWeight::Lightweight
    }
}

pub struct EnqueueRequest<'a> {
    pub job_id: Uuid,
    pub work_dir: PathBuf,
    pub input_path: PathBuf,
    pub original_filename: &'a str,
    pub input_bytes: u64,
    pub plan: ConversionPlan,
    pub options: ConversionOptions,
}

impl JobScheduler {

    pub async fn enqueue(&self, req: EnqueueRequest<'_>) -> Result<WorkloadWeight, AppError> {
        let EnqueueRequest {
            job_id,
            work_dir,
            input_path,
            original_filename,
            input_bytes,
            plan,
            options,
        } = req;
        let lane = Self::classify_lane(&plan, input_bytes);
        let stem = PathBuf::from(sanitize_filename(original_filename))
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "converted".to_string());

        let record = JobRecord {
            id: job_id,
            work_dir,
            output_path: None,
            plan: plan.clone(),
            status: JobStatus::Queued { lane },
            created_at: Instant::now(),
        };

        {
            let mut map = self.jobs.write().await;
            map.insert(job_id, record);
        }

        let task = QueuedTask {
            job_id,
            input_path,
            output_stem: stem,
            plan,
            options,
            lane,
        };

        let send_res = match lane {
            WorkloadWeight::Lightweight => {
                self.light_pending.fetch_add(1, Ordering::Relaxed);
                self.light_tx.try_send(task)
            }
            WorkloadWeight::Heavy => {
                self.heavy_pending.fetch_add(1, Ordering::Relaxed);
                self.heavy_tx.try_send(task)
            }
        };

        if send_res.is_err() {
            match lane {
                WorkloadWeight::Lightweight => {
                    self.light_pending.fetch_sub(1, Ordering::Relaxed);
                }
                WorkloadWeight::Heavy => {
                    self.heavy_pending.fetch_sub(1, Ordering::Relaxed);
                }
            }
            let mut map = self.jobs.write().await;
            if let Some(rec) = map.remove(&job_id) {
                let _ = fs::remove_dir_all(&rec.work_dir);
            }
            return Err(AppError::ProcessingFailed(
                "Conversion queue is temporarily full; please retry shortly".to_string(),
            ));
        }

        Ok(lane)
    }

    async fn run_task(&self, task: QueuedTask) {
        let start = Instant::now();
        let total_steps = task.plan.steps.len();
        let timeout_secs = match task.lane {
            WorkloadWeight::Lightweight => self.cfg.lightweight_timeout_secs,
            WorkloadWeight::Heavy => self.cfg.heavy_timeout_secs,
        };

        let work_dir = {
            let map = self.jobs.read().await;
            match map.get(&task.job_id) {
                Some(r) => r.work_dir.clone(),
                None => return,
            }
        };

        let mut current_input = task.input_path.clone();

        for (idx, step) in task.plan.steps.iter().enumerate() {
            let step_num = idx + 1;
            let step_label = format!(
                "Step {step_num}/{total_steps}: {} -> {} ({})",
                step.from.extension().to_uppercase(),
                step.to.extension().to_uppercase(),
                step.engine_name
            );

            {
                let mut map = self.jobs.write().await;
                if let Some(rec) = map.get_mut(&task.job_id) {
                    rec.status = JobStatus::Running {
                        lane: task.lane,
                        current_step: step_num,
                        total_steps,
                        step_label,
                    };
                }
            }

            let step_output = work_dir.join(format!("step_{step_num}.{}", step.to.extension()));
            let exec_res = execute_step(StepExecParams {
                engine: step.engine,
                from: step.from,
                to: step.to,
                input_path: &current_input,
                output_path: &step_output,
                work_dir: &work_dir,
                options: &task.options,
                cfg: &self.cfg,
                caps: &self.caps,
                timeout_secs,
            })
            .await;

            if let Err(err) = exec_res {
                let mut map = self.jobs.write().await;
                if let Some(rec) = map.get_mut(&task.job_id) {
                    rec.status = JobStatus::Failed {
                        lane: task.lane,
                        reason: err.to_string(),
                    };
                }
                return;
            }

            if !step_output.exists() {
                let mut map = self.jobs.write().await;
                if let Some(rec) = map.get_mut(&task.job_id) {
                    rec.status = JobStatus::Failed {
                        lane: task.lane,
                        reason: format!(
                            "Step {step_num} completed without producing expected {} artifact",
                            step.to
                        ),
                    };
                }
                return;
            }

            current_input = step_output;
        }

        // Hash and finalize artifact
        let meta = match fs::metadata(&current_input) {
            Ok(m) => m,
            Err(e) => {
                let mut map = self.jobs.write().await;
                if let Some(rec) = map.get_mut(&task.job_id) {
                    rec.status = JobStatus::Failed {
                        lane: task.lane,
                        reason: format!("Failed to read output metadata: {e}"),
                    };
                }
                return;
            }
        };

        let sha256 = compute_sha256_hex(&current_input).unwrap_or_default();
        let final_filename = format!("{}.{}", task.output_stem, task.plan.target.extension());
        let elapsed_ms = start.elapsed().as_millis() as u64;

        let mut map = self.jobs.write().await;
        if let Some(rec) = map.get_mut(&task.job_id) {
            rec.output_path = Some(current_input);
            rec.status = JobStatus::Completed {
                lane: task.lane,
                output_filename: final_filename,
                output_mime: task.plan.target.mime_type().to_string(),
                output_size: meta.len(),
                sha256,
                elapsed_ms,
            };
        }
    }

    pub async fn get_job(&self, id: Uuid) -> Option<JobRecord> {
        let map = self.jobs.read().await;
        map.get(&id).cloned()
    }

    pub async fn metrics(&self) -> QueueMetrics {
        let count = self.jobs.read().await.len();
        QueueMetrics {
            lightweight_pending: self.light_pending.load(Ordering::Relaxed),
            heavy_pending: self.heavy_pending.load(Ordering::Relaxed),
            total_tracked_jobs: count,
        }
    }

    async fn evict_expired(&self) {
        let ttl = Duration::from_secs(self.cfg.job_ttl_secs);
        let mut to_remove = Vec::new();
        {
            let map = self.jobs.read().await;
            for (id, rec) in map.iter() {
                if rec.created_at.elapsed() > ttl
                    && !matches!(rec.status, JobStatus::Running { .. } | JobStatus::Queued { .. })
                {
                    to_remove.push((*id, rec.work_dir.clone()));
                }
            }
        }
        if !to_remove.is_empty() {
            let mut map = self.jobs.write().await;
            for (id, dir) in to_remove {
                map.remove(&id);
                let _ = fs::remove_dir_all(&dir);
            }
        }
    }
}

fn compute_sha256_hex(path: &PathBuf) -> Result<String, std::io::Error> {
    let mut f = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 32768];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}
