use crate::config::AppConfig;
use crate::error::AppError;
use crate::security::validator::safe_join_under;
use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveEntryInfo {
    pub path: String,
    pub compressed_bytes: u64,
    pub uncompressed_bytes: u64,
    pub is_dir: bool,
    pub encrypted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveInspection {
    pub total_entries: usize,
    pub total_uncompressed_bytes: u64,
    pub total_compressed_bytes: u64,
    pub max_ratio: u64,
    pub has_encrypted_entries: bool,
    pub entries: Vec<ArchiveEntryInfo>,
}

/// Inspects a ZIP archive strictly before extracting, guarding against:
/// 1. Zip-bombs (excessive uncompressed size or compression ratio)
/// 2. Entry-flood DoS (excessive file count)
/// 3. Zip-Slip path traversal (`../`)
/// 4. Symlink escape entries
pub fn inspect_zip(zip_path: &Path, cfg: &AppConfig) -> Result<ArchiveInspection, AppError> {
    let file = File::open(zip_path).map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| AppError::BadRequest(format!("Invalid ZIP archive: {e}")))?;

    let count = archive.len();
    if count > cfg.max_archive_entries {
        return Err(AppError::SecurityViolation(format!(
            "Archive contains {count} entries, exceeding maximum limit of {}",
            cfg.max_archive_entries
        )));
    }

    let mut total_uncompressed: u64 = 0;
    let mut total_compressed: u64 = 0;
    let mut max_ratio: u64 = 1;
    let mut has_encrypted = false;
    let mut entries = Vec::with_capacity(count.min(500));

    let scratch_base = Path::new("/sandbox_check");
    for i in 0..count {
        let entry = archive
            .by_index_raw(i)
            .map_err(|e| AppError::BadRequest(format!("Corrupt ZIP entry: {e}")))?;

        let name = entry
            .name()
            .map_err(|e| AppError::SecurityViolation(format!("Unsafe or invalid ZIP entry name: {e}")))?
            .into_owned();
        // Verify Zip-Slip path safety
        let _ = safe_join_under(scratch_base, &name)?;

        // Reject Unix symlinks inside untrusted archives (0o120000 = S_IFLNK)
        if let Some(mode) = entry.unix_mode() {
            if (mode & 0o170000) == 0o120000 {
                return Err(AppError::SecurityViolation(format!(
                    "Symlink entry '{name}' is forbidden inside uploaded archives"
                )));
            }
        }

        let uncomp = entry.size();
        let comp = entry.compressed_size();
        total_uncompressed = total_uncompressed.saturating_add(uncomp);
        total_compressed = total_compressed.saturating_add(comp);

        if total_uncompressed > cfg.max_uncompressed_bytes {
            return Err(AppError::SecurityViolation(format!(
                "Archive uncompressed size exceeds limit of {} bytes (potential zip bomb)",
                cfg.max_uncompressed_bytes
            )));
        }

        if uncomp > 1024 * 1024 {
            let ratio = uncomp / comp.max(1);
            max_ratio = max_ratio.max(ratio);
            if ratio > cfg.max_compression_ratio {
                return Err(AppError::SecurityViolation(format!(
                    "Archive entry '{name}' has suspicious expansion ratio {ratio}:1 (max {}:1)",
                    cfg.max_compression_ratio
                )));
            }
        }

        if entry.encrypted() {
            has_encrypted = true;
        }

        if entries.len() < 500 {
            entries.push(ArchiveEntryInfo {
                path: name,
                compressed_bytes: comp,
                uncompressed_bytes: uncomp,
                is_dir: entry.is_dir(),
                encrypted: entry.encrypted(),
            });
        }
    }

    Ok(ArchiveInspection {
        total_entries: count,
        total_uncompressed_bytes: total_uncompressed,
        total_compressed_bytes: total_compressed,
        max_ratio,
        has_encrypted_entries: has_encrypted,
        entries,
    })
}

/// Extracts a ZIP archive into `dest_dir` with runtime streaming byte accounting so forged
/// ZIP headers claiming smaller uncompressed sizes cannot cause disk exhaustion.
pub fn extract_zip_safely(
    zip_path: &Path,
    dest_dir: &Path,
    cfg: &AppConfig,
    password: Option<&str>,
    selected_entries: &[String],
) -> Result<Vec<PathBuf>, AppError> {
    let _inspection = inspect_zip(zip_path, cfg)?;

    let file = File::open(zip_path).map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| AppError::BadRequest(format!("Invalid ZIP: {e}")))?;

    let mut extracted_files = Vec::new();
    let mut remaining_budget = cfg.max_uncompressed_bytes;

    for i in 0..archive.len() {
        let mut entry = if let Some(pw) = password {
            match archive.by_index_decrypt(i, pw.as_bytes()) {
                Ok(f) => f,
                Err(zip::result::ZipError::InvalidPassword) => {
                    return Err(AppError::BadRequest(
                        "Incorrect archive password".to_string(),
                    ));
                }
                Err(e) => {
                    return Err(AppError::BadRequest(format!("Archive decryption error: {e}")));
                }
            }
        } else {
            match archive.by_index(i) {
                Ok(f) => f,
                Err(zip::result::ZipError::UnsupportedArchive(msg))
                    if msg.contains("Password") =>
                {
                    return Err(AppError::BadRequest(
                        "Archive is password-protected; please provide a password".to_string(),
                    ));
                }
                Err(e) => return Err(AppError::BadRequest(format!("Archive read error: {e}"))),
            }
        };

        let rel_name = entry
            .name()
            .map_err(|e| AppError::SecurityViolation(format!("Unsafe or invalid ZIP entry name: {e}")))?
            .into_owned();
        if !selected_entries.is_empty() && !selected_entries.iter().any(|s| s == &rel_name) {
            continue;
        }

        let target = safe_join_under(dest_dir, &rel_name)?;
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| AppError::Internal(e.to_string()))?;
            continue;
        }

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| AppError::Internal(e.to_string()))?;
        }

        let mut out_file =
            File::create(&target).map_err(|e| AppError::Internal(e.to_string()))?;

        // Read strictly up to remaining_budget + 1 byte to detect forged ZIP size headers!
        let mut limited = (&mut entry).take(remaining_budget.saturating_add(1));
        let copied = io::copy(&mut limited, &mut out_file)
            .map_err(|e| AppError::ProcessingFailed(format!("Extraction failed: {e}")))?;

        if copied > remaining_budget {
            let _ = fs::remove_file(&target);
            return Err(AppError::SecurityViolation(
                "Streamed extraction exceeded uncompressed byte budget (forged header zip bomb)"
                    .to_string(),
            ));
        }

        remaining_budget -= copied;
        extracted_files.push(target);
    }

    Ok(extracted_files)
}

/// Checks 7-Zip `7z l -slt` tabular metadata output before extraction so RAR/7Z/ISO
/// archives are also guarded against zip-bombs, symlinks, and path traversal.
pub fn validate_7z_listing(stdout: &str, cfg: &AppConfig) -> Result<ArchiveInspection, AppError> {
    let mut entries = Vec::new();
    let mut cur_path: Option<String> = None;
    let mut cur_size: u64 = 0;
    let mut cur_packed: u64 = 0;
    let mut cur_is_dir = false;
    let mut cur_encrypted = false;
    let mut cur_attr = String::new();

    let mut total_uncompressed: u64 = 0;
    let mut total_compressed: u64 = 0;
    let mut max_ratio: u64 = 1;
    let mut total_entries: usize = 0;
    let mut has_encrypted = false;

    let scratch_base = Path::new("/sandbox_check");

    let flush_entry = |path: Option<String>,
                       size: u64,
                       packed: u64,
                       is_dir: bool,
                       encrypted: bool,
                       attr: &str,
                       total_uncomp: &mut u64,
                       total_comp: &mut u64,
                       max_r: &mut u64,
                       count: &mut usize,
                       has_enc: &mut bool,
                       list: &mut Vec<ArchiveEntryInfo>|
     -> Result<(), AppError> {
        let Some(p) = path else { return Ok(()) };
        *count += 1;
        if *count > cfg.max_archive_entries {
            return Err(AppError::SecurityViolation(format!(
                "Archive entry count exceeds maximum of {}",
                cfg.max_archive_entries
            )));
        }
        let _ = safe_join_under(scratch_base, &p)?;
        if attr.contains('l') || attr.starts_with('l') {
            return Err(AppError::SecurityViolation(format!(
                "Symlink entry '{p}' blocked inside archive"
            )));
        }
        *total_uncomp = total_uncomp.saturating_add(size);
        *total_comp = total_comp.saturating_add(packed);
        if *total_uncomp > cfg.max_uncompressed_bytes {
            return Err(AppError::SecurityViolation(
                "Archive uncompressed size exceeds limit (zip-bomb guard)".to_string(),
            ));
        }
        if size > 1024 * 1024 {
            let ratio = size / packed.max(1);
            *max_r = (*max_r).max(ratio);
            if ratio > cfg.max_compression_ratio {
                return Err(AppError::SecurityViolation(format!(
                    "Suspicious compression ratio {ratio}:1 detected on '{p}'"
                )));
            }
        }
        if encrypted {
            *has_enc = true;
        }
        if list.len() < 500 {
            list.push(ArchiveEntryInfo {
                path: p,
                compressed_bytes: packed,
                uncompressed_bytes: size,
                is_dir,
                encrypted,
            });
        }
        Ok(())
    };

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            flush_entry(
                cur_path.take(),
                cur_size,
                cur_packed,
                cur_is_dir,
                cur_encrypted,
                &cur_attr,
                &mut total_uncompressed,
                &mut total_compressed,
                &mut max_ratio,
                &mut total_entries,
                &mut has_encrypted,
                &mut entries,
            )?;
            cur_size = 0;
            cur_packed = 0;
            cur_is_dir = false;
            cur_encrypted = false;
            cur_attr.clear();
            continue;
        }

        if let Some(val) = line.strip_prefix("Path = ") {
            // Skip first summary header line if we haven't seen "----------" yet
            if !entries.is_empty() || cur_size > 0 || !val.contains('.') || !val.ends_with(".7z") {
                cur_path = Some(val.to_string());
            }
        } else if let Some(val) = line.strip_prefix("Size = ") {
            cur_size = val.parse::<u64>().unwrap_or(0);
        } else if let Some(val) = line.strip_prefix("Packed Size = ") {
            cur_packed = val.parse::<u64>().unwrap_or(0);
        } else if let Some(val) = line.strip_prefix("Folder = ") {
            cur_is_dir = val == "+";
        } else if let Some(val) = line.strip_prefix("Encrypted = ") {
            cur_encrypted = val == "+";
        } else if let Some(val) = line.strip_prefix("Attributes = ") {
            cur_attr = val.to_string();
        }
    }

    flush_entry(
        cur_path.take(),
        cur_size,
        cur_packed,
        cur_is_dir,
        cur_encrypted,
        &cur_attr,
        &mut total_uncompressed,
        &mut total_compressed,
        &mut max_ratio,
        &mut total_entries,
        &mut has_encrypted,
        &mut entries,
    )?;

    Ok(ArchiveInspection {
        total_entries,
        total_uncompressed_bytes: total_uncompressed,
        total_compressed_bytes: total_compressed,
        max_ratio,
        has_encrypted_entries: has_encrypted,
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;
    use zip::write::SimpleFileOptions;

    #[test]
    fn blocks_zip_slip_archive() {
        let mut tmp = NamedTempFile::new().unwrap();
        {
            let mut zw = zip::ZipWriter::new(&mut tmp);
            zw.start_file("../evil.txt", SimpleFileOptions::default()).unwrap();
            zw.write_all(b"pwned").unwrap();
            zw.finish().unwrap();
        }
        let cfg = AppConfig::from_env();
        let res = inspect_zip(tmp.path(), &cfg);
        assert!(matches!(res, Err(AppError::SecurityViolation(_))));
    }

    #[test]
    fn blocks_zip_bomb_ratio() {
        let mut tmp = NamedTempFile::new().unwrap();
        {
            let mut zw = zip::ZipWriter::new(&mut tmp);
            zw.start_file("bomb.txt", SimpleFileOptions::default()).unwrap();
            // 2 MB of zeroes compresses to ~2 KB (~1000:1 ratio)
            let zeros = vec![0u8; 2 * 1024 * 1024];
            zw.write_all(&zeros).unwrap();
            zw.finish().unwrap();
        }
        let cfg = AppConfig::from_env();
        let res = inspect_zip(tmp.path(), &cfg);
        assert!(matches!(res, Err(AppError::SecurityViolation(_))));
    }
}
