use crate::error::AppError;
use crate::formats::Format;
use std::path::{Component, Path, PathBuf};

/// Sanitizes an untrusted user-supplied filename to a safe basename.
/// Prevents path traversal (`..`), hidden dotfiles, leading `-` (CLI flag confusion),
/// NUL bytes, and overly long filenames.
pub fn sanitize_filename(raw: &str) -> String {
    let base = raw
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("upload")
        .trim();

    let mut cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && *c != '\0')
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '`' | '$' | ';' | '&' => '_',
            _ => c,
        })
        .collect();

    while cleaned.starts_with('.') || cleaned.starts_with('-') || cleaned.starts_with(' ') {
        cleaned.remove(0);
    }

    if cleaned.contains("..") {
        cleaned = cleaned.replace("..", "_");
    }

    if cleaned.is_empty() {
        cleaned = "converted_file".to_string();
    }

    if cleaned.len() > 120 {
        cleaned.truncate(120);
    }

    cleaned
}

/// Resolves a relative archive entry path strictly under `base`, rejecting any
/// path traversal (`..`), root prefixes, or null/backslash characters (Zip-Slip guard).
pub fn safe_join_under(base: &Path, untrusted_rel: &str) -> Result<PathBuf, AppError> {
    if untrusted_rel.is_empty()
        || untrusted_rel.contains('\0')
        || untrusted_rel.contains('\\')
        || untrusted_rel.contains('\r')
        || untrusted_rel.contains('\n')
    {
        return Err(AppError::SecurityViolation(
            "Archive contains malformed or disallowed path characters".to_string(),
        ));
    }

    let rel_path = Path::new(untrusted_rel);
    let mut joined = PathBuf::from(base);

    for comp in rel_path.components() {
        match comp {
            Component::Normal(part) => {
                let s = part.to_string_lossy();
                if s == ".." || s.is_empty() {
                    return Err(AppError::SecurityViolation(
                        "Path traversal component detected".to_string(),
                    ));
                }
                joined.push(part);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::SecurityViolation(format!(
                    "Blocked unsafe path traversal entry '{untrusted_rel}'"
                )));
            }
        }
    }

    if !joined.starts_with(base) {
        return Err(AppError::SecurityViolation(
            "Resolved path escaped sandbox root".to_string(),
        ));
    }

    Ok(joined)
}

/// Validates uploaded file magic bytes & structural signatures against the declared format.
/// Prevents disguised executables (ELF/PE/Mach-O) and polyglot spoofing.
pub fn verify_file_magic(head: &[u8], declared: Format) -> Result<(), AppError> {
    if head.is_empty() {
        return Err(AppError::BadRequest("Uploaded file is empty".to_string()));
    }

    // Reject native binary executables disguised as media/documents
    if head.starts_with(b"\x7FELF")
        || head.starts_with(b"MZ\x90\x00")
        || head.starts_with(b"\xCF\xFA\xED\xFE")
        || head.starts_with(b"\xFE\xED\xFA\xCF")
    {
        return Err(AppError::SecurityViolation(
            "Executable binary payloads are forbidden".to_string(),
        ));
    }

    // Text-like formats must be valid UTF-8/ASCII (or UTF-16 BOM) without raw NUL bytes
    if declared.is_text_like() {
        let is_utf16 = head.starts_with(b"\xFF\xFE") || head.starts_with(b"\xFE\xFF");
        if !is_utf16 {
            if head.contains(&0u8) {
                return Err(AppError::SecurityViolation(format!(
                    "Binary NUL bytes detected in text-based format '{}'",
                    declared.extension()
                )));
            }
            // Validate prefix as UTF-8 (up to last complete char boundary)
            if let Err(e) = std::str::from_utf8(head) {
                // Allow trailing incomplete multi-byte UTF-8 char if sliced mid-character at buffer boundary
                if e.error_len().is_some() {
                    return Err(AppError::SecurityViolation(format!(
                        "Invalid UTF-8 content for declared format '{}'",
                        declared.extension()
                    )));
                }
            }
        }
        return Ok(());
    }

    // Strict magic-byte checks for well-known binary containers
    match declared {
        Format::Pdf => {
            if !head.starts_with(b"%PDF-") && !head.windows(5).take(512).any(|w| w == b"%PDF-") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match PDF header (%PDF-)".to_string(),
                ));
            }
        }
        Format::Png => {
            if !head.starts_with(b"\x89PNG\r\n\x1A\n") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match PNG header".to_string(),
                ));
            }
        }
        Format::Jpg => {
            if !head.starts_with(b"\xFF\xD8\xFF") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match JPEG header".to_string(),
                ));
            }
        }
        Format::Gif => {
            if !(head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a")) {
                return Err(AppError::SecurityViolation(
                    "File signature does not match GIF header".to_string(),
                ));
            }
        }
        Format::Webp => {
            if !(head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match WebP RIFF header".to_string(),
                ));
            }
        }
        Format::Sqlite => {
            if !head.starts_with(b"SQLite format 3\0") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match SQLite3 header".to_string(),
                ));
            }
        }
        Format::Parquet => {
            if !head.starts_with(b"PAR1") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match Apache Parquet header".to_string(),
                ));
            }
        }
        Format::Zip
        | Format::Docx
        | Format::Xlsx
        | Format::Pptx
        | Format::Odt
        | Format::Ods
        | Format::Odp
        | Format::Epub
        | Format::Cbz => {
            if !(head.starts_with(b"PK\x03\x04")
                || head.starts_with(b"PK\x05\x06")
                || head.starts_with(b"PK\x07\x08"))
            {
                return Err(AppError::SecurityViolation(format!(
                    "File signature does not match ZIP/OOXML container for '{}'",
                    declared.extension()
                )));
            }
        }
        Format::SevenZ => {
            if !head.starts_with(b"7z\xBC\xAF\x27\x1C") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match 7z header".to_string(),
                ));
            }
        }
        Format::Rar | Format::Cbr => {
            if !head.starts_with(b"Rar!") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match RAR header".to_string(),
                ));
            }
        }
        Format::Gz => {
            if !head.starts_with(b"\x1F\x8B") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match GZIP header".to_string(),
                ));
            }
        }
        Format::Bz2 => {
            if !head.starts_with(b"BZh") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match BZIP2 header".to_string(),
                ));
            }
        }
        Format::Xz => {
            if !head.starts_with(b"\xFD7zXZ\x00") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match XZ header".to_string(),
                ));
            }
        }
        Format::Psd => {
            if !head.starts_with(b"8BPS") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match PSD header".to_string(),
                ));
            }
        }
        Format::Woff => {
            if !head.starts_with(b"wOFF") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match WOFF header".to_string(),
                ));
            }
        }
        Format::Woff2 => {
            if !head.starts_with(b"wOF2") {
                return Err(AppError::SecurityViolation(
                    "File signature does not match WOFF2 header".to_string(),
                ));
            }
        }
        _ => {
            // For remaining formats (e.g., RAW, legacy Office OLE2, media containers), verify via `infer`
            // does not detect a completely mismatched dangerous file type.
            if let Some(detected) = infer::get(head) {
                if detected.mime_type().contains("x-executable")
                    || detected.mime_type().contains("x-msdownload")
                    || detected.mime_type().contains("x-mach-binary")
                {
                    return Err(AppError::SecurityViolation(
                        "Executable payload rejected".to_string(),
                    ));
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_traversal_and_flag_injection() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("-rf;rm -rf /"), "converted_file");
        assert_eq!(sanitize_filename("-evil;cmd.pdf"), "evil_cmd.pdf");
        assert_eq!(sanitize_filename("..hidden.pdf"), "hidden.pdf");
    }

    #[test]
    fn rejects_zip_slip_paths() {
        let base = Path::new("/tmp/job123");
        assert!(safe_join_under(base, "../escape.txt").is_err());
        assert!(safe_join_under(base, "/etc/shadow").is_err());
        assert!(safe_join_under(base, "sub/../../escape.txt").is_err());
        assert!(safe_join_under(base, "folder/valid.png").is_ok());
    }

    #[test]
    fn blocks_disguised_elf_as_pdf() {
        let fake_pdf = b"\x7FELF\x02\x01\x01\x00";
        assert!(verify_file_magic(fake_pdf, Format::Pdf).is_err());
    }
}
