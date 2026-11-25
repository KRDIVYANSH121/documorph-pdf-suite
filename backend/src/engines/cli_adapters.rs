use crate::config::SandboxMode;
use crate::engines::container_runner::run_sandboxed_command;
use crate::engines::StepExecParams;
use crate::error::AppError;
use crate::formats::graph::EngineId;
use crate::formats::options::{
    AudioChannels, AudioCodec, BitrateMode, HardwareAccel, ResolutionPreset, SubtitleMode,
    VideoCodec,
};
use crate::formats::{Format, FormatCategory};
use crate::security::zip_guard::validate_7z_listing;
use std::fs;
use std::path::Path;

/// Translates paths inside `work_dir` to `/work/<rel>` when running inside a Docker worker container,
/// or keeps relative/local path when running directly in an isolated host process.
fn engine_path(p: &Path, work_dir: &Path, params: &StepExecParams<'_>) -> String {
    let uses_docker = match params.cfg.sandbox_mode {
        SandboxMode::DockerStrict => true,
        SandboxMode::DockerPreferred => params.caps.docker_available,
        SandboxMode::ProcessIsolated => false,
    };

    let rel = p.strip_prefix(work_dir).unwrap_or(p);
    if uses_docker {
        format!("/work/{}", rel.to_string_lossy().replace('\\', "/"))
    } else {
        rel.to_string_lossy().into_owned()
    }
}

pub async fn execute_cli_engine(params: StepExecParams<'_>) -> Result<(), AppError> {
    if !params.caps.is_engine_available(params.engine, params.cfg) {
        return Err(AppError::EngineUnavailable(
            params.engine.display_name().to_string(),
        ));
    }

    match params.engine {
        EngineId::FFmpeg => run_ffmpeg(&params).await,
        EngineId::LibreOffice => run_libreoffice(&params).await,
        EngineId::Pandoc => run_pandoc(&params).await,
        EngineId::ImageMagick => run_imagemagick(&params).await,
        EngineId::Inkscape => run_inkscape(&params).await,
        EngineId::Calibre => run_calibre(&params).await,
        EngineId::SevenZip => run_seven_zip(&params).await,
        EngineId::FontTools => run_fonttools(&params).await,
        EngineId::AssimpCad => run_assimp_cad(&params).await,
        EngineId::DataBridge => run_data_bridge(&params).await,
        EngineId::NativeRust => unreachable!("Handled by native_rust"),
    }
}

async fn run_ffmpeg(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);
    let media = &params.options.media;

    let mut args = vec!["-y".to_string(), "-hide_banner".to_string(), "-loglevel".to_string(), "error".to_string()];

    // Hardware Acceleration setup (GPU offloading)
    let use_nvenc = match media.hw_accel {
        HardwareAccel::Nvenc => true,
        HardwareAccel::Auto => params.caps.nvenc_gpu,
        _ => false,
    };
    let use_vaapi = !use_nvenc
        && match media.hw_accel {
            HardwareAccel::Vaapi => true,
            HardwareAccel::Auto => params.caps.vaapi_gpu,
            _ => false,
        };

    if use_vaapi {
        args.extend([
            "-vaapi_device".to_string(),
            "/dev/dri/renderD128".to_string(),
        ]);
    }

    args.extend(["-i".to_string(), in_arg]);

    // Frame snapshot extraction (Video -> PNG/JPG)
    if matches!(params.to, Format::Png | Format::Jpg) {
        args.extend([
            "-ss".to_string(),
            "00:00:01".to_string(),
            "-vframes".to_string(),
            "1".to_string(),
            out_arg,
        ]);
        run_sandboxed_command(
            "ffmpeg",
            &args,
            params.work_dir,
            params.cfg,
            params.caps.docker_available,
            params.timeout_secs,
            false,
        )
        .await?;
        return Ok(());
    }

    // Subtitle extraction
    if matches!(params.to, Format::Srt | Format::Vtt) {
        args.extend(["-map".to_string(), "0:s:0".to_string(), out_arg]);
        run_sandboxed_command(
            "ffmpeg",
            &args,
            params.work_dir,
            params.cfg,
            params.caps.docker_available,
            params.timeout_secs,
            false,
        )
        .await?;
        return Ok(());
    }

    // Video transcoding options
    if params.to.category() == FormatCategory::Video && params.to != Format::Gif {
        let vcodec = match (media.video_codec, use_nvenc, use_vaapi, params.to) {
            (VideoCodec::H264, true, _, _) => "h264_nvenc",
            (VideoCodec::H265, true, _, _) => "hevc_nvenc",
            (VideoCodec::H264, false, true, _) => "h264_vaapi",
            (VideoCodec::H265, false, true, _) => "hevc_vaapi",
            (VideoCodec::H264, _, _, _) => "libx264",
            (VideoCodec::H265, _, _, _) => "libx265",
            (VideoCodec::Vp9, _, _, _) => "libvpx-vp9",
            (VideoCodec::Av1, _, _, _) => "libaom-av1",
            (VideoCodec::Auto, true, _, Format::Mp4 | Format::Mkv | Format::Mov) => "h264_nvenc",
            (VideoCodec::Auto, _, _, Format::Webm) => "libvpx-vp9",
            (VideoCodec::Auto, _, _, Format::Mp4 | Format::Mkv | Format::Mov) => "libx264",
            _ => "",
        };
        if !vcodec.is_empty() {
            args.extend(["-c:v".to_string(), vcodec.to_string()]);
        }

        if let Some(fps) = media.fps {
            args.extend(["-r".to_string(), fps.to_string()]);
        }

        let scale_filter = match media.resolution {
            ResolutionPreset::Original => None,
            ResolutionPreset::R480p => Some("scale=-2:480"),
            ResolutionPreset::R720p => Some("scale=-2:720"),
            ResolutionPreset::R1080p => Some("scale=-2:1080"),
            ResolutionPreset::R4K => Some("scale=-2:2160"),
        };
        if let Some(vf) = scale_filter {
            args.extend(["-vf".to_string(), vf.to_string()]);
        }

        if let Some(v_kbps) = media.video_bitrate_kbps {
            let br = format!("{v_kbps}k");
            args.extend(["-b:v".to_string(), br.clone()]);
            if media.bitrate_mode == BitrateMode::Cbr {
                args.extend([
                    "-minrate".to_string(),
                    br.clone(),
                    "-maxrate".to_string(),
                    br.clone(),
                    "-bufsize".to_string(),
                    format!("{}k", v_kbps * 2),
                ]);
            }
        }

        match media.subtitle_mode {
            SubtitleMode::Strip => args.push("-sn".to_string()),
            SubtitleMode::Keep => {}
            SubtitleMode::ExtractSrt | SubtitleMode::ExtractVtt => {}
        }
    }

    // Audio options (for both Audio outputs and Video audio streams)
    if params.to.category() == FormatCategory::Audio {
        args.push("-vn".to_string());
    }

    let acodec = match media.audio_codec {
        AudioCodec::Auto => None,
        AudioCodec::Aac => Some("aac"),
        AudioCodec::Mp3 => Some("libmp3lame"),
        AudioCodec::Opus => Some("libopus"),
        AudioCodec::Flac => Some("flac"),
        AudioCodec::Pcm => Some("pcm_s16le"),
    };
    if let Some(ac) = acodec {
        args.extend(["-c:a".to_string(), ac.to_string()]);
    }

    if let Some(a_kbps) = media.audio_bitrate_kbps {
        args.extend(["-b:a".to_string(), format!("{a_kbps}k")]);
    }

    match media.channels {
        AudioChannels::Original => {}
        AudioChannels::Stereo => args.extend(["-ac".to_string(), "2".to_string()]),
        AudioChannels::Mono => args.extend(["-ac".to_string(), "1".to_string()]),
    }

    args.push(out_arg);

    run_sandboxed_command(
        "ffmpeg",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        use_nvenc,
    )
    .await?;

    Ok(())
}

async fn run_libreoffice(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_dir = params.output_path.parent().unwrap_or(params.work_dir);
    let out_dir_arg = engine_path(out_dir, params.work_dir, params);
    let profile_dir = params.work_dir.join("lo_profile");
    fs::create_dir_all(&profile_dir).map_err(|e| AppError::Internal(e.to_string()))?;
    let profile_arg = format!(
        "-env:UserInstallation=file://{}",
        engine_path(&profile_dir, params.work_dir, params)
    );

    let args = vec![
        "--headless".to_string(),
        "--nologo".to_string(),
        "--nodefault".to_string(),
        "--norestore".to_string(),
        "--nofirststartwizard".to_string(),
        profile_arg,
        "--convert-to".to_string(),
        params.to.extension().to_string(),
        "--outdir".to_string(),
        out_dir_arg,
        in_arg,
    ];

    run_sandboxed_command(
        "soffice",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;

    // LibreOffice writes <input_stem>.<to_ext> inside out_dir; rename to exact expected output_path
    let expected_lo_name = format!(
        "{}.{}",
        params
            .input_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy(),
        params.to.extension()
    );
    let produced = out_dir.join(expected_lo_name);
    if produced != params.output_path && produced.exists() {
        fs::rename(&produced, params.output_path)
            .map_err(|e| AppError::Internal(format!("Rename LibreOffice output failed: {e}")))?;
    }

    Ok(())
}

async fn run_pandoc(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);

    let pandoc_fmt = |f: Format| -> &'static str {
        match f {
            Format::Md => "markdown",
            Format::Tex => "latex",
            Format::Txt => "plain",
            Format::Xhtml => "html",
            _ => f.extension(),
        }
    };

    let args = vec![
        in_arg,
        "-f".to_string(),
        pandoc_fmt(params.from).to_string(),
        "-t".to_string(),
        pandoc_fmt(params.to).to_string(),
        "--sandbox".to_string(),
        "-o".to_string(),
        out_arg,
    ];

    run_sandboxed_command(
        "pandoc",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}

async fn run_imagemagick(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);

    let mut args = vec![
        "-limit".to_string(),
        "memory".to_string(),
        "512MiB".to_string(),
        "-limit".to_string(),
        "disk".to_string(),
        "1GiB".to_string(),
        "-limit".to_string(),
        "time".to_string(),
        "60".to_string(),
    ];

    if let Some(dpi) = params.options.document.dpi {
        args.extend(["-density".to_string(), dpi.to_string()]);
    }
    args.push(in_arg);

    if params.options.document.grayscale {
        args.extend(["-colorspace".to_string(), "Gray".to_string()]);
    }
    if let Some(q) = params.options.document.quality {
        args.extend(["-quality".to_string(), q.to_string()]);
    }
    args.push(out_arg);

    run_sandboxed_command(
        "magick",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}

async fn run_inkscape(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);

    let args = vec![
        in_arg,
        format!("--export-type={}", params.to.extension()),
        format!("--export-filename={out_arg}"),
    ];

    run_sandboxed_command(
        "inkscape",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}

async fn run_calibre(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);
    let args = vec![in_arg, out_arg];

    run_sandboxed_command(
        "ebook-convert",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}

async fn run_seven_zip(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);

    // Step 1: Pre-inspect archive listing BEFORE extracting to enforce zip-bomb & zip-slip guards!
    let mut list_args = vec!["l".to_string(), "-slt".to_string()];
    if let Some(pw) = &params.options.archive.password {
        list_args.push(format!("-p{pw}"));
    } else {
        list_args.push("-p".to_string());
    }
    list_args.push("--".to_string());
    list_args.push(in_arg.clone());

    let list_out = run_sandboxed_command(
        "7z",
        &list_args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;

    let _inspection = validate_7z_listing(&list_out.stdout, params.cfg)?;

    // Step 2: Safe extraction into isolated subdir
    let extract_dir = params.work_dir.join("7z_extract");
    fs::create_dir_all(&extract_dir).map_err(|e| AppError::Internal(e.to_string()))?;
    let extract_arg = format!("-o{}", engine_path(&extract_dir, params.work_dir, params));

    let mut ext_args = vec!["x".to_string(), "-y".to_string(), "-snld-".to_string(), extract_arg];
    if let Some(pw) = &params.options.archive.password {
        ext_args.push(format!("-p{pw}"));
    } else {
        ext_args.push("-p".to_string());
    }
    ext_args.push("--".to_string());
    ext_args.push(in_arg);

    for entry in &params.options.archive.selected_entries {
        if !entry.contains("..") && !entry.starts_with('/') && !entry.starts_with('-') {
            ext_args.push(entry.clone());
        }
    }

    run_sandboxed_command(
        "7z",
        &ext_args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;

    // Step 3: Repack into target archive format
    let out_arg = engine_path(params.output_path, params.work_dir, params);
    let type_flag = match params.to {
        Format::Zip | Format::Cbz => "-tzip",
        Format::SevenZ => "-t7z",
        Format::Tar => "-ttar",
        Format::Gz => "-tgzip",
        Format::Bz2 => "-tbzip2",
        Format::Xz => "-txz",
        _ => "-tzip",
    };

    let mut pack_args = vec![
        "a".to_string(),
        "-y".to_string(),
        type_flag.to_string(),
        params.options.archive.compression_level.sevenz_mx_flag().to_string(),
        "--".to_string(),
        out_arg,
        format!("{}/*", engine_path(&extract_dir, params.work_dir, params)),
    ];

    if params.to == Format::SevenZ || params.to == Format::Zip {
        if let Some(pw) = &params.options.archive.password {
            pack_args.insert(3, format!("-p{pw}"));
        }
    }

    run_sandboxed_command(
        "7z",
        &pack_args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}

async fn run_fonttools(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);

    if params.to == Format::Woff2 && matches!(params.from, Format::Ttf | Format::Otf) {
        run_sandboxed_command(
            "woff2_compress",
            std::slice::from_ref(&in_arg),
            params.work_dir,
            params.cfg,
            params.caps.docker_available,
            params.timeout_secs,
            false,
        )
        .await?;
        let produced = params.input_path.with_extension("woff2");
        if produced.exists() && produced != params.output_path {
            fs::rename(produced, params.output_path)
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }
        return Ok(());
    }

    let args = vec![
        "ttLib".to_string(),
        in_arg,
        "-o".to_string(),
        out_arg,
    ];
    run_sandboxed_command(
        "fonttools",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}

async fn run_assimp_cad(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);
    let args = vec!["export".to_string(), in_arg, out_arg];

    run_sandboxed_command(
        "assimp",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}

async fn run_data_bridge(params: &StepExecParams<'_>) -> Result<(), AppError> {
    let in_arg = engine_path(params.input_path, params.work_dir, params);
    let out_arg = engine_path(params.output_path, params.work_dir, params);

    // Strictly validated safe DuckDB SQL generated only from fixed trusted format tokens (never user input).
    let read_expr = match params.from {
        Format::Parquet => format!("read_parquet('{in_arg}')"),
        Format::Csv => format!("read_csv_auto('{in_arg}')"),
        Format::Json => format!("read_json_auto('{in_arg}')"),
        _ => return Err(AppError::UnsupportedConversion("Unsupported DataBridge source".to_string())),
    };
    let copy_fmt = match params.to {
        Format::Parquet => "FORMAT PARQUET",
        Format::Csv => "FORMAT CSV, HEADER",
        Format::Json => "FORMAT JSON, ARRAY true",
        _ => return Err(AppError::UnsupportedConversion("Unsupported DataBridge target".to_string())),
    };

    let sql = format!("COPY (SELECT * FROM {read_expr}) TO '{out_arg}' ({copy_fmt});");
    let args = vec!["-c".to_string(), sql];

    run_sandboxed_command(
        "duckdb",
        &args,
        params.work_dir,
        params.cfg,
        params.caps.docker_available,
        params.timeout_secs,
        false,
    )
    .await?;
    Ok(())
}
