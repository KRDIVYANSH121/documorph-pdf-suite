use crate::config::AppConfig;
use crate::error::AppError;
use crate::formats::options::ConversionOptions;
use crate::formats::{Format, FormatCategory};
use crate::security::validator::safe_join_under;
use crate::security::zip_guard::extract_zip_safely;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use image::ImageFormat;
use pulldown_cmark::{html, Options as MdOptions, Parser};
use rusqlite::{Connection, OpenFlags};
use serde_json::{Map, Value};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

pub fn convert_native(
    input_path: &Path,
    output_path: &Path,
    from: Format,
    to: Format,
    work_dir: &Path,
    options: &ConversionOptions,
    cfg: &AppConfig,
) -> Result<(), AppError> {
    match (from.category(), to.category()) {
        (FormatCategory::Images, FormatCategory::Images) => {
            convert_raster_image(input_path, output_path, to, options)
        }
        (FormatCategory::Documents, FormatCategory::Documents) => {
            convert_markup_or_text(input_path, output_path, from, to)
        }
        (FormatCategory::Spreadsheets, FormatCategory::Spreadsheets) => {
            convert_tabular_or_sqlite(input_path, output_path, from, to)
        }
        (FormatCategory::Archives, FormatCategory::Archives) => {
            convert_archive_native(input_path, output_path, from, to, work_dir, options, cfg)
        }
        _ => Err(AppError::UnsupportedConversion(format!(
            "NativeRust does not support {from} -> {to}"
        ))),
    }
}

fn to_image_format(fmt: Format) -> Option<ImageFormat> {
    match fmt {
        Format::Png => Some(ImageFormat::Png),
        Format::Jpg => Some(ImageFormat::Jpeg),
        Format::Webp => Some(ImageFormat::WebP),
        Format::Gif => Some(ImageFormat::Gif),
        Format::Bmp => Some(ImageFormat::Bmp),
        Format::Tiff => Some(ImageFormat::Tiff),
        Format::Ico => Some(ImageFormat::Ico),
        _ => None,
    }
}

fn convert_raster_image(
    input_path: &Path,
    output_path: &Path,
    to: Format,
    options: &ConversionOptions,
) -> Result<(), AppError> {
    let target_fmt = to_image_format(to).ok_or_else(|| {
        AppError::UnsupportedConversion(format!("Unsupported native image target: {to}"))
    })?;

    let mut img = image::open(input_path)
        .map_err(|e| AppError::BadRequest(format!("Failed to decode input image: {e}")))?;

    // Guard against pixel-flood decompression bombs (e.g., 100,000 x 100,000 image)
    let pixels = (img.width() as u64).saturating_mul(img.height() as u64);
    if pixels > 100_000_000 {
        return Err(AppError::SecurityViolation(
            "Image pixel dimensions exceed 100MP safety limit".to_string(),
        ));
    }

    if options.document.grayscale {
        img = img.grayscale();
    }

    if target_fmt == ImageFormat::Ico && (img.width() > 256 || img.height() > 256) {
        img = img.thumbnail(256, 256);
    }

    if target_fmt == ImageFormat::Jpeg {
        let rgb = img.to_rgb8();
        let quality = options.document.quality.unwrap_or(88).clamp(10, 100);
        let file = File::create(output_path).map_err(|e| AppError::Internal(e.to_string()))?;
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(file, quality);
        encoder
            .encode_image(&rgb)
            .map_err(|e| AppError::ProcessingFailed(format!("JPEG encode failed: {e}")))?;
        return Ok(());
    }

    img.save_with_format(output_path, target_fmt)
        .map_err(|e| AppError::ProcessingFailed(format!("Image save failed: {e}")))
}

fn convert_markup_or_text(
    input_path: &Path,
    output_path: &Path,
    from: Format,
    to: Format,
) -> Result<(), AppError> {
    let input = fs::read_to_string(input_path)
        .map_err(|e| AppError::BadRequest(format!("Input is not valid UTF-8 text: {e}")))?;

    let rendered = match (from, to) {
        (Format::Md, Format::Html | Format::Xhtml) => {
            let mut opts = MdOptions::empty();
            opts.insert(MdOptions::ENABLE_TABLES);
            opts.insert(MdOptions::ENABLE_STRIKETHROUGH);
            opts.insert(MdOptions::ENABLE_TASKLISTS);
            let parser = Parser::new_ext(&input, opts);
            let mut body = String::new();
            html::push_html(&mut body, parser);
            if to == Format::Xhtml {
                format!(
                    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\"><head><meta charset=\"utf-8\"/><title>Document</title></head><body>{body}</body></html>"
                )
            } else {
                format!(
                    "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"/><title>Document</title></head><body>{body}</body></html>"
                )
            }
        }
        (Format::Md, Format::Txt) => {
            let parser = Parser::new(&input);
            let mut plain = String::new();
            for event in parser {
                match event {
                    pulldown_cmark::Event::Text(t) | pulldown_cmark::Event::Code(t) => {
                        plain.push_str(&t);
                    }
                    pulldown_cmark::Event::SoftBreak | pulldown_cmark::Event::HardBreak => {
                        plain.push('\n');
                    }
                    pulldown_cmark::Event::End(_) => {
                        plain.push('\n');
                    }
                    _ => {}
                }
            }
            plain
        }
        (Format::Txt, Format::Html) => {
            let escaped = escape_html(&input);
            format!(
                "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"/><title>Document</title></head><body><pre>{escaped}</pre></body></html>"
            )
        }
        (Format::Txt, Format::Md) => input,
        (Format::Html, Format::Txt) => strip_html_tags(&input),
        _ => {
            return Err(AppError::UnsupportedConversion(format!(
                "Unsupported native text transform {from} -> {to}"
            )));
        }
    };

    fs::write(output_path, rendered.as_bytes()).map_err(|e| AppError::Internal(e.to_string()))
}

fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn strip_html_tags(html_str: &str) -> String {
    let mut out = String::with_capacity(html_str.len());
    let mut in_tag = false;
    for ch in html_str.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn convert_tabular_or_sqlite(
    input_path: &Path,
    output_path: &Path,
    from: Format,
    to: Format,
) -> Result<(), AppError> {
    match (from, to) {
        (Format::Csv | Format::Tsv, Format::Csv | Format::Tsv) => {
            let in_delim = if from == Format::Tsv { b'\t' } else { b',' };
            let out_delim = if to == Format::Tsv { b'\t' } else { b',' };
            let mut rdr = csv::ReaderBuilder::new()
                .delimiter(in_delim)
                .flexible(true)
                .from_path(input_path)
                .map_err(|e| AppError::BadRequest(format!("CSV parse error: {e}")))?;
            let mut wtr = csv::WriterBuilder::new()
                .delimiter(out_delim)
                .from_path(output_path)
                .map_err(|e| AppError::Internal(e.to_string()))?;

            if let Ok(headers) = rdr.headers() {
                wtr.write_record(headers)
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
            }
            for rec in rdr.records() {
                let record = rec.map_err(|e| AppError::BadRequest(format!("Row error: {e}")))?;
                wtr.write_record(&record)
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
            }
            wtr.flush().map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(())
        }
        (Format::Csv | Format::Tsv, Format::Json) => {
            let delim = if from == Format::Tsv { b'\t' } else { b',' };
            let mut rdr = csv::ReaderBuilder::new()
                .delimiter(delim)
                .from_path(input_path)
                .map_err(|e| AppError::BadRequest(format!("CSV parse error: {e}")))?;
            let headers = rdr
                .headers()
                .map_err(|e| AppError::BadRequest(format!("Missing CSV headers: {e}")))?
                .clone();

            let mut rows = Vec::new();
            for rec in rdr.records() {
                let record = rec.map_err(|e| AppError::BadRequest(format!("Row error: {e}")))?;
                let mut obj = Map::new();
                for (i, field) in record.iter().enumerate() {
                    let key = headers.get(i).unwrap_or("col").to_string();
                    obj.insert(key, Value::String(field.to_string()));
                }
                rows.push(Value::Object(obj));
            }
            let out_file = File::create(output_path).map_err(|e| AppError::Internal(e.to_string()))?;
            serde_json::to_writer_pretty(out_file, &rows)
                .map_err(|e| AppError::Internal(e.to_string()))
        }
        (Format::Json, Format::Csv | Format::Tsv) => {
            let raw = fs::read_to_string(input_path)
                .map_err(|e| AppError::BadRequest(format!("Invalid UTF-8 JSON: {e}")))?;
            let val: Value = serde_json::from_str(&raw)
                .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;
            let arr = val
                .as_array()
                .ok_or_else(|| AppError::BadRequest("JSON root must be an array of objects".to_string()))?;
            if arr.is_empty() {
                fs::write(output_path, b"").map_err(|e| AppError::Internal(e.to_string()))?;
                return Ok(());
            }
            let mut cols: Vec<String> = Vec::new();
            if let Some(first) = arr.first().and_then(|v| v.as_object()) {
                cols.extend(first.keys().cloned());
            }
            let delim = if to == Format::Tsv { b'\t' } else { b',' };
            let mut wtr = csv::WriterBuilder::new()
                .delimiter(delim)
                .from_path(output_path)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            wtr.write_record(&cols)
                .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
            for item in arr {
                let row: Vec<String> = cols
                    .iter()
                    .map(|k| match item.get(k) {
                        Some(Value::String(s)) => s.clone(),
                        Some(Value::Null) | None => String::new(),
                        Some(other) => other.to_string(),
                    })
                    .collect();
                wtr.write_record(&row)
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
            }
            wtr.flush().map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(())
        }
        (Format::Sqlite, Format::Csv | Format::Json | Format::Sql) => {
            export_sqlite_readonly(input_path, output_path, to)
        }
        (Format::Csv | Format::Json, Format::Sqlite) => {
            import_into_sqlite(input_path, output_path, from)
        }
        _ => Err(AppError::UnsupportedConversion(format!(
            "Unsupported native tabular conversion {from} -> {to}"
        ))),
    }
}

fn quote_sqlite_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

fn export_sqlite_readonly(
    db_path: &Path,
    output_path: &Path,
    to: Format,
) -> Result<(), AppError> {
    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| AppError::BadRequest(format!("Invalid SQLite database: {e}")))?;

    // Defense-in-depth: disallow risky SQLite extensions or writable schema
    conn.pragma_update(None, "query_only", true)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut table_stmt = conn
        .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;

    let tables: Vec<(String, Option<String>)> = table_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| AppError::ProcessingFailed(e.to_string()))?
        .filter_map(Result::ok)
        .collect();

    if tables.is_empty() {
        return Err(AppError::BadRequest("SQLite database contains no user tables".to_string()));
    }

    match to {
        Format::Csv => {
            // Export first table cleanly as CSV
            let table_name = &tables[0].0;
            let sql = format!("SELECT * FROM {}", quote_sqlite_ident(table_name));
            let mut stmt = conn
                .prepare(&sql)
                .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
            let col_names: Vec<String> = stmt.column_names().map(|s| s.to_string()).collect();

            let mut wtr = csv::Writer::from_path(output_path)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            wtr.write_record(&col_names)
                .map_err(|e| AppError::Internal(e.to_string()))?;

            let mut rows = stmt
                .query([])
                .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
            while let Some(row) = rows
                .next()
                .map_err(|e| AppError::ProcessingFailed(e.to_string()))?
            {
                let mut record = Vec::with_capacity(col_names.len());
                for i in 0..col_names.len() {
                    record.push(sqlite_val_to_string(row.get_ref(i).ok()));
                }
                wtr.write_record(&record)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            }
            wtr.flush().map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(())
        }
        Format::Json => {
            let mut root = Map::new();
            for (table_name, _) in &tables {
                let sql = format!("SELECT * FROM {}", quote_sqlite_ident(table_name));
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
                let col_names: Vec<String> = stmt.column_names().map(|s| s.to_string()).collect();
                let mut table_rows = Vec::new();
                let mut rows = stmt
                    .query([])
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
                while let Some(row) = rows
                    .next()
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?
                {
                    let mut obj = Map::new();
                    for (i, col) in col_names.iter().enumerate() {
                        let json_v = match row.get_ref(i).ok() {
                            Some(rusqlite::types::ValueRef::Null) | None => Value::Null,
                            Some(rusqlite::types::ValueRef::Integer(n)) => Value::from(n),
                            Some(rusqlite::types::ValueRef::Real(f)) => serde_json::Number::from_f64(f)
                                .map(Value::Number)
                                .unwrap_or(Value::Null),
                            Some(rusqlite::types::ValueRef::Text(t)) => {
                                Value::String(String::from_utf8_lossy(t).into_owned())
                            }
                            Some(rusqlite::types::ValueRef::Blob(b)) => Value::String(hex::encode(b)),
                        };
                        obj.insert(col.clone(), json_v);
                    }
                    table_rows.push(Value::Object(obj));
                }
                root.insert(table_name.clone(), Value::Array(table_rows));
            }
            let out_file = File::create(output_path).map_err(|e| AppError::Internal(e.to_string()))?;
            serde_json::to_writer_pretty(out_file, &Value::Object(root))
                .map_err(|e| AppError::Internal(e.to_string()))
        }
        Format::Sql => {
            let mut out = File::create(output_path).map_err(|e| AppError::Internal(e.to_string()))?;
            writeln!(out, "BEGIN TRANSACTION;").map_err(|e| AppError::Internal(e.to_string()))?;
            for (table_name, create_sql) in &tables {
                if let Some(ddl) = create_sql {
                    writeln!(out, "{ddl};").map_err(|e| AppError::Internal(e.to_string()))?;
                }
                let q_table = quote_sqlite_ident(table_name);
                let sql = format!("SELECT * FROM {q_table}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
                let col_count = stmt.column_count();
                let mut rows = stmt
                    .query([])
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
                while let Some(row) = rows
                    .next()
                    .map_err(|e| AppError::ProcessingFailed(e.to_string()))?
                {
                    let mut literals = Vec::with_capacity(col_count);
                    for i in 0..col_count {
                        let lit = match row.get_ref(i).ok() {
                            Some(rusqlite::types::ValueRef::Null) | None => "NULL".to_string(),
                            Some(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
                            Some(rusqlite::types::ValueRef::Real(f)) => f.to_string(),
                            Some(rusqlite::types::ValueRef::Text(t)) => {
                                let s = String::from_utf8_lossy(t).replace('\'', "''");
                                format!("'{s}'")
                            }
                            Some(rusqlite::types::ValueRef::Blob(b)) => {
                                format!("X'{}'", hex::encode(b))
                            }
                        };
                        literals.push(lit);
                    }
                    writeln!(out, "INSERT INTO {q_table} VALUES ({});", literals.join(", "))
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                }
            }
            writeln!(out, "COMMIT;").map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(())
        }
        _ => Err(AppError::UnsupportedConversion("Unsupported SQLite export target".to_string())),
    }
}

fn sqlite_val_to_string(v: Option<rusqlite::types::ValueRef<'_>>) -> String {
    match v {
        Some(rusqlite::types::ValueRef::Null) | None => String::new(),
        Some(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
        Some(rusqlite::types::ValueRef::Real(f)) => f.to_string(),
        Some(rusqlite::types::ValueRef::Text(t)) => String::from_utf8_lossy(t).into_owned(),
        Some(rusqlite::types::ValueRef::Blob(b)) => hex::encode(b),
    }
}

fn import_into_sqlite(
    input_path: &Path,
    output_path: &Path,
    from: Format,
) -> Result<(), AppError> {
    let (headers, rows): (Vec<String>, Vec<Vec<String>>) = match from {
        Format::Csv => {
            let mut rdr = csv::Reader::from_path(input_path)
                .map_err(|e| AppError::BadRequest(format!("CSV parse error: {e}")))?;
            let hdrs = rdr
                .headers()
                .map_err(|e| AppError::BadRequest(format!("CSV header error: {e}")))?
                .iter()
                .map(|s| if s.trim().is_empty() { "col".to_string() } else { s.trim().to_string() })
                .collect();
            let mut r = Vec::new();
            for rec in rdr.records() {
                let record = rec.map_err(|e| AppError::BadRequest(format!("CSV row error: {e}")))?;
                r.push(record.iter().map(|s| s.to_string()).collect());
            }
            (hdrs, r)
        }
        Format::Json => {
            let raw = fs::read_to_string(input_path)
                .map_err(|e| AppError::BadRequest(format!("Invalid UTF-8 JSON: {e}")))?;
            let val: Value = serde_json::from_str(&raw)
                .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;
            let arr = val
                .as_array()
                .ok_or_else(|| AppError::BadRequest("JSON root must be an array of objects".to_string()))?;
            let hdrs: Vec<String> = arr
                .first()
                .and_then(|v| v.as_object())
                .map(|o| o.keys().cloned().collect())
                .unwrap_or_else(|| vec!["value".to_string()]);
            let mut r = Vec::new();
            for item in arr {
                let row = hdrs
                    .iter()
                    .map(|k| match item.get(k) {
                        Some(Value::String(s)) => s.clone(),
                        Some(Value::Null) | None => String::new(),
                        Some(other) => other.to_string(),
                    })
                    .collect();
                r.push(row);
            }
            (hdrs, r)
        }
        _ => return Err(AppError::UnsupportedConversion("Unsupported SQLite import".to_string())),
    };

    if headers.is_empty() {
        return Err(AppError::BadRequest("Input has no columns".to_string()));
    }

    let mut conn = Connection::open(output_path)
        .map_err(|e| AppError::Internal(format!("Failed to create SQLite DB: {e}")))?;

    let col_defs: Vec<String> = headers
        .iter()
        .map(|h| format!("{} TEXT", quote_sqlite_ident(h)))
        .collect();
    let create_sql = format!("CREATE TABLE imported_data ({});", col_defs.join(", "));
    conn.execute_batch(&create_sql)
        .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;

    let placeholders: Vec<String> = (1..=headers.len()).map(|i| format!("?{i}")).collect();
    let insert_sql = format!(
        "INSERT INTO imported_data VALUES ({})",
        placeholders.join(", ")
    );

    let tx = conn
        .transaction()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    {
        let mut stmt = tx
            .prepare(&insert_sql)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        for row in &rows {
            let padded: Vec<String> = (0..headers.len())
                .map(|i| row.get(i).cloned().unwrap_or_default())
                .collect();
            stmt.execute(rusqlite::params_from_iter(padded.iter()))
                .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
        }
    }
    tx.commit().map_err(|e| AppError::Internal(e.to_string()))
}

fn convert_archive_native(
    input_path: &Path,
    output_path: &Path,
    from: Format,
    to: Format,
    work_dir: &Path,
    options: &ConversionOptions,
    cfg: &AppConfig,
) -> Result<(), AppError> {
    let extract_dir = work_dir.join("native_extract");
    fs::create_dir_all(&extract_dir).map_err(|e| AppError::Internal(e.to_string()))?;

    // Step 1: Safe extraction with Zip-Bomb & Zip-Slip enforcement
    let extracted_files = match from {
        Format::Zip => extract_zip_safely(
            input_path,
            &extract_dir,
            cfg,
            options.archive.password.as_deref(),
            &options.archive.selected_entries,
        )?,
        Format::Tar => extract_tar_reader(
            File::open(input_path).map_err(|e| AppError::Internal(e.to_string()))?,
            &extract_dir,
            cfg,
            &options.archive.selected_entries,
        )?,
        Format::Gz => {
            let gz_file = File::open(input_path).map_err(|e| AppError::Internal(e.to_string()))?;
            // Probe whether this .gz wraps a .tar or single file
            let mut dec = GzDecoder::new(gz_file);
            let single_out = extract_dir.join("payload.bin");
            let mut out = File::create(&single_out).map_err(|e| AppError::Internal(e.to_string()))?;
            let mut limited = (&mut dec).take(cfg.max_uncompressed_bytes.saturating_add(1));
            let copied = io::copy(&mut limited, &mut out)
                .map_err(|e| AppError::BadRequest(format!("Invalid GZIP payload: {e}")))?;
            if copied > cfg.max_uncompressed_bytes {
                return Err(AppError::SecurityViolation(
                    "GZIP stream exceeded maximum uncompressed byte budget".to_string(),
                ));
            }
            drop(out);

            // Check if extracted stream is a TAR archive (magic "ustar" at offset 257)
            let mut probe = vec![0u8; 265];
            let mut pf = File::open(&single_out).map_err(|e| AppError::Internal(e.to_string()))?;
            let n = pf.read(&mut probe).unwrap_or(0);
            if n >= 262 && &probe[257..262] == b"ustar" {
                let tar_dir = work_dir.join("tar_extract");
                fs::create_dir_all(&tar_dir).map_err(|e| AppError::Internal(e.to_string()))?;
                extract_tar_reader(
                    File::open(&single_out).map_err(|e| AppError::Internal(e.to_string()))?,
                    &tar_dir,
                    cfg,
                    &options.archive.selected_entries,
                )?
            } else {
                vec![single_out]
            }
        }
        _ => {
            return Err(AppError::UnsupportedConversion(format!(
                "Native archive reader does not support {from}"
            )));
        }
    };

    // Step 2: Safe repack into target archive format
    let extract_root = if work_dir.join("tar_extract").exists() {
        work_dir.join("tar_extract")
    } else {
        extract_dir
    };

    match to {
        Format::Zip => {
            let out_f = File::create(output_path).map_err(|e| AppError::Internal(e.to_string()))?;
            let mut zw = zip::ZipWriter::new(out_f);
            let level = options.archive.compression_level.flate2_level() as i64;
            let zopts = if level == 0 {
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)
            } else {
                SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated)
                    .compression_level(Some(level))
            };
            for file_path in &extracted_files {
                let rel = file_path
                    .strip_prefix(&extract_root)
                    .unwrap_or(file_path.as_path())
                    .to_string_lossy()
                    .replace('\\', "/");
                zw.start_file(rel, zopts)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut f = File::open(file_path).map_err(|e| AppError::Internal(e.to_string()))?;
                io::copy(&mut f, &mut zw).map_err(|e| AppError::Internal(e.to_string()))?;
            }
            zw.finish().map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(())
        }
        Format::Tar => {
            let out_f = File::create(output_path).map_err(|e| AppError::Internal(e.to_string()))?;
            let mut builder = tar::Builder::new(out_f);
            for file_path in &extracted_files {
                let rel = file_path.strip_prefix(&extract_root).unwrap_or(file_path.as_path());
                builder
                    .append_path_with_name(file_path, rel)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            }
            builder.finish().map_err(|e| AppError::Internal(e.to_string()))
        }
        Format::Gz => {
            let out_f = File::create(output_path).map_err(|e| AppError::Internal(e.to_string()))?;
            let lvl = Compression::new(options.archive.compression_level.flate2_level());
            let gz = GzEncoder::new(out_f, lvl);
            let mut builder = tar::Builder::new(gz);
            for file_path in &extracted_files {
                let rel = file_path.strip_prefix(&extract_root).unwrap_or(file_path.as_path());
                builder
                    .append_path_with_name(file_path, rel)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            }
            let gz = builder.into_inner().map_err(|e| AppError::Internal(e.to_string()))?;
            gz.finish().map_err(|e| AppError::Internal(e.to_string()))?;
            Ok(())
        }
        _ => Err(AppError::UnsupportedConversion(format!(
            "Native archive writer does not support {to}"
        ))),
    }
}

fn extract_tar_reader<R: Read>(
    reader: R,
    dest_dir: &Path,
    cfg: &AppConfig,
    selected_entries: &[String],
) -> Result<Vec<PathBuf>, AppError> {
    let mut archive = tar::Archive::new(reader);
    let mut extracted = Vec::new();
    let mut remaining_budget = cfg.max_uncompressed_bytes;
    let mut entry_count: usize = 0;

    for entry_res in archive
        .entries()
        .map_err(|e| AppError::BadRequest(format!("Invalid TAR archive: {e}")))?
    {
        entry_count += 1;
        if entry_count > cfg.max_archive_entries {
            return Err(AppError::SecurityViolation(
                "TAR entry count exceeds configured safety limit".to_string(),
            ));
        }

        let mut entry =
            entry_res.map_err(|e| AppError::BadRequest(format!("Corrupt TAR entry: {e}")))?;

        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            return Err(AppError::SecurityViolation(
                "Symlink or hardlink entries are forbidden inside uploaded TAR archives".to_string(),
            ));
        }

        let rel_str = entry
            .path()
            .map_err(|e| AppError::BadRequest(format!("Invalid TAR entry path: {e}")))?
            .to_string_lossy()
            .into_owned();

        if !selected_entries.is_empty() && !selected_entries.iter().any(|s| s == &rel_str) {
            continue;
        }

        let target = safe_join_under(dest_dir, &rel_str)?;
        if entry_type.is_dir() {
            fs::create_dir_all(&target).map_err(|e| AppError::Internal(e.to_string()))?;
            continue;
        }
        if !entry_type.is_file() {
            continue;
        }

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| AppError::Internal(e.to_string()))?;
        }
        let mut out = File::create(&target).map_err(|e| AppError::Internal(e.to_string()))?;
        let mut limited = (&mut entry).take(remaining_budget.saturating_add(1));
        let copied = io::copy(&mut limited, &mut out)
            .map_err(|e| AppError::ProcessingFailed(e.to_string()))?;
        if copied > remaining_budget {
            let _ = fs::remove_file(&target);
            return Err(AppError::SecurityViolation(
                "TAR uncompressed size exceeded safety budget".to_string(),
            ));
        }
        remaining_budget -= copied;
        extracted.push(target);
    }

    Ok(extracted)
}
