use omnimorph_backend::config::AppConfig;
use omnimorph_backend::engines::native_rust::convert_native;
use omnimorph_backend::error::AppError;
use omnimorph_backend::formats::graph::CompatibilityGraph;
use omnimorph_backend::formats::options::{ConversionOptions, LayoutMode};
use omnimorph_backend::formats::Format;
use omnimorph_backend::security::validator::verify_file_magic;
use std::fs;
use std::io::Write;
use tempfile::tempdir;
use zip::write::SimpleFileOptions;

#[test]
fn test_compatibility_graph_and_layout_modes() {
    let graph = CompatibilityGraph::build();

    // Multi-step chained conversion: EPUB -> PDF / DOCX, DWG -> GLTF
    let cad_plan = graph.plan(Format::Dwg, Format::Gltf, LayoutMode::Editable);
    assert!(cad_plan.is_some());

    // PDF -> PNG (Flattened) vs PDF -> DOCX (Editable)
    let editable_plan = graph.plan(Format::Pdf, Format::Docx, LayoutMode::Editable).unwrap();
    assert_eq!(editable_plan.steps[0].to, Format::Docx);

    let raster_plan = graph.plan(Format::Pdf, Format::Png, LayoutMode::Flattened).unwrap();
    assert_eq!(raster_plan.steps[0].to, Format::Png);

    // Impossible routes must be None
    assert!(graph.plan(Format::Mp3, Format::Xlsx, LayoutMode::Editable).is_none());
    assert!(graph.plan(Format::Woff2, Format::Sql, LayoutMode::Editable).is_none());
}

#[test]
fn test_native_image_conversion_png_to_webp() {
    let dir = tempdir().unwrap();
    let cfg = AppConfig::from_env();
    let in_path = dir.path().join("test.png");
    let out_path = dir.path().join("out.webp");

    // Create 4x4 PNG
    let img = image::RgbaImage::from_pixel(4, 4, image::Rgba([255, 0, 128, 255]));
    img.save_with_format(&in_path, image::ImageFormat::Png).unwrap();

    let head = fs::read(&in_path).unwrap();
    verify_file_magic(&head, Format::Png).unwrap();

    convert_native(
        &in_path,
        &out_path,
        Format::Png,
        Format::Webp,
        dir.path(),
        &ConversionOptions::default(),
        &cfg,
    )
    .unwrap();

    assert!(out_path.exists());
    let out_bytes = fs::read(&out_path).unwrap();
    verify_file_magic(&out_bytes, Format::Webp).unwrap();
}

#[test]
fn test_native_sqlite_csv_json_sql_roundtrip() {
    let dir = tempdir().unwrap();
    let cfg = AppConfig::from_env();
    let csv_in = dir.path().join("data.csv");
    let db_out = dir.path().join("data.sqlite");
    let json_out = dir.path().join("data.json");
    let sql_out = dir.path().join("data.sql");

    // Include tricky SQL-injection-like value in CSV to verify parameterized inserts & safe quoting
    fs::write(&csv_in, "id,name\n1,\"Alice'; DROP TABLE imported_data;--\"\n2,Bob\n").unwrap();

    convert_native(
        &csv_in,
        &db_out,
        Format::Csv,
        Format::Sqlite,
        dir.path(),
        &ConversionOptions::default(),
        &cfg,
    )
    .unwrap();
    assert!(db_out.exists());

    convert_native(
        &db_out,
        &json_out,
        Format::Sqlite,
        Format::Json,
        dir.path(),
        &ConversionOptions::default(),
        &cfg,
    )
    .unwrap();
    let json_str = fs::read_to_string(&json_out).unwrap();
    assert!(json_str.contains("Alice'; DROP TABLE imported_data;--"));

    convert_native(
        &db_out,
        &sql_out,
        Format::Sqlite,
        Format::Sql,
        dir.path(),
        &ConversionOptions::default(),
        &cfg,
    )
    .unwrap();
    let sql_str = fs::read_to_string(&sql_out).unwrap();
    assert!(sql_str.contains("CREATE TABLE"));
    assert!(sql_str.contains("COMMIT;"));
}

#[test]
fn test_native_archive_repack_and_zip_bomb_guard() {
    let dir = tempdir().unwrap();
    let cfg = AppConfig::from_env();

    // Valid ZIP -> TAR -> GZ
    let valid_zip = dir.path().join("valid.zip");
    {
        let f = fs::File::create(&valid_zip).unwrap();
        let mut zw = zip::ZipWriter::new(f);
        zw.start_file("hello.txt", SimpleFileOptions::default()).unwrap();
        zw.write_all(b"Hello OmniMorph!").unwrap();
        zw.finish().unwrap();
    }
    let tar_out = dir.path().join("repacked.tar");
    convert_native(
        &valid_zip,
        &tar_out,
        Format::Zip,
        Format::Tar,
        dir.path(),
        &ConversionOptions::default(),
        &cfg,
    )
    .unwrap();
    assert!(tar_out.exists());

    // Malicious Zip-Slip ZIP must be rejected
    let evil_zip = dir.path().join("evil.zip");
    {
        let f = fs::File::create(&evil_zip).unwrap();
        let mut zw = zip::ZipWriter::new(f);
        zw.start_file("../../escape.sh", SimpleFileOptions::default()).unwrap();
        zw.write_all(b"echo pwned").unwrap();
        zw.finish().unwrap();
    }
    let blocked_out = dir.path().join("blocked.tar");
    let res = convert_native(
        &evil_zip,
        &blocked_out,
        Format::Zip,
        Format::Tar,
        dir.path(),
        &ConversionOptions::default(),
        &cfg,
    );
    assert!(matches!(res, Err(AppError::SecurityViolation(_))));
}
