pub mod graph;
pub mod options;

use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FormatCategory {
    Documents,
    Spreadsheets,
    Presentations,
    Images,
    Audio,
    Video,
    Ebooks,
    Archives,
    FontsAndCad,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkloadWeight {
    Lightweight,
    Heavy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    // Documents & Markup
    Pdf,
    Docx,
    Doc,
    Odt,
    Rtf,
    Txt,
    Md,
    Html,
    Xhtml,
    Tex,
    Rst,
    Wpd,

    // Spreadsheets & Databases
    Xlsx,
    Xls,
    Csv,
    Tsv,
    Ods,
    Dbf,
    Sqlite,
    Parquet,
    Json,
    Yaml,
    Sql,

    // Presentations
    Pptx,
    Ppt,
    Odp,
    Key,

    // Raster & Vector Images
    Jpg,
    Png,
    Webp,
    Avif,
    Gif,
    Tiff,
    Bmp,
    Ico,
    Heic,
    Heif,
    Cr2,
    Nef,
    Arw,
    Psd,
    Svg,
    Eps,
    Ai,
    Emf,
    Wmf,

    // Audio
    Mp3,
    Wav,
    Flac,
    Aac,
    Ogg,
    M4a,
    Wma,
    Aiff,
    Opus,
    Amr,

    // Video & Subtitles
    Mp4,
    Mkv,
    Avi,
    Mov,
    Webm,
    Flv,
    Wmv,
    Mpeg,
    #[serde(rename = "3gp")]
    ThreeGp,
    Srt,
    Vtt,

    // eBooks
    Epub,
    Mobi,
    Azw3,
    Fb2,
    Lit,
    Lrf,
    Cbr,
    Cbz,

    // Archives & Compression
    Zip,
    Rar,
    #[serde(rename = "7z")]
    SevenZ,
    Tar,
    Gz,
    Bz2,
    Xz,
    Iso,

    // Fonts & 3D/CAD
    Ttf,
    Otf,
    Woff,
    Woff2,
    Eot,
    Stl,
    Obj,
    Fbx,
    Gltf,
    Dxf,
    Dwg,
}

#[derive(Debug, Clone, Serialize)]
pub struct FormatMetadata {
    pub id: Format,
    pub ext: &'static str,
    pub label: &'static str,
    pub category: FormatCategory,
    pub mime: &'static str,
    pub is_text_like: bool,
    pub default_weight: WorkloadWeight,
}

impl fmt::Display for Format {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.extension())
    }
}

impl Format {
    pub const ALL: &'static [Format] = &[
        // Documents
        Format::Pdf,
        Format::Docx,
        Format::Doc,
        Format::Odt,
        Format::Rtf,
        Format::Txt,
        Format::Md,
        Format::Html,
        Format::Xhtml,
        Format::Tex,
        Format::Rst,
        Format::Wpd,
        // Spreadsheets & Databases
        Format::Xlsx,
        Format::Xls,
        Format::Csv,
        Format::Tsv,
        Format::Ods,
        Format::Dbf,
        Format::Sqlite,
        Format::Parquet,
        Format::Json,
        Format::Yaml,
        Format::Sql,
        // Presentations
        Format::Pptx,
        Format::Ppt,
        Format::Odp,
        Format::Key,
        // Images
        Format::Jpg,
        Format::Png,
        Format::Webp,
        Format::Avif,
        Format::Gif,
        Format::Tiff,
        Format::Bmp,
        Format::Ico,
        Format::Heic,
        Format::Heif,
        Format::Cr2,
        Format::Nef,
        Format::Arw,
        Format::Psd,
        Format::Svg,
        Format::Eps,
        Format::Ai,
        Format::Emf,
        Format::Wmf,
        // Audio
        Format::Mp3,
        Format::Wav,
        Format::Flac,
        Format::Aac,
        Format::Ogg,
        Format::M4a,
        Format::Wma,
        Format::Aiff,
        Format::Opus,
        Format::Amr,
        // Video & Subtitles
        Format::Mp4,
        Format::Mkv,
        Format::Avi,
        Format::Mov,
        Format::Webm,
        Format::Flv,
        Format::Wmv,
        Format::Mpeg,
        Format::ThreeGp,
        Format::Srt,
        Format::Vtt,
        // eBooks
        Format::Epub,
        Format::Mobi,
        Format::Azw3,
        Format::Fb2,
        Format::Lit,
        Format::Lrf,
        Format::Cbr,
        Format::Cbz,
        // Archives
        Format::Zip,
        Format::Rar,
        Format::SevenZ,
        Format::Tar,
        Format::Gz,
        Format::Bz2,
        Format::Xz,
        Format::Iso,
        // Fonts & 3D/CAD
        Format::Ttf,
        Format::Otf,
        Format::Woff,
        Format::Woff2,
        Format::Eot,
        Format::Stl,
        Format::Obj,
        Format::Fbx,
        Format::Gltf,
        Format::Dxf,
        Format::Dwg,
    ];

    pub fn from_ext(raw: &str) -> Option<Self> {
        let norm = raw.trim().trim_start_matches('.').to_ascii_lowercase();
        match norm.as_str() {
            "pdf" => Some(Format::Pdf),
            "docx" => Some(Format::Docx),
            "doc" => Some(Format::Doc),
            "odt" => Some(Format::Odt),
            "rtf" => Some(Format::Rtf),
            "txt" | "text" => Some(Format::Txt),
            "md" | "markdown" => Some(Format::Md),
            "html" | "htm" => Some(Format::Html),
            "xhtml" => Some(Format::Xhtml),
            "tex" | "latex" => Some(Format::Tex),
            "rst" => Some(Format::Rst),
            "wpd" => Some(Format::Wpd),

            "xlsx" => Some(Format::Xlsx),
            "xls" => Some(Format::Xls),
            "csv" => Some(Format::Csv),
            "tsv" => Some(Format::Tsv),
            "ods" => Some(Format::Ods),
            "dbf" => Some(Format::Dbf),
            "sqlite" | "sqlite3" | "db" => Some(Format::Sqlite),
            "parquet" => Some(Format::Parquet),
            "json" => Some(Format::Json),
            "yaml" | "yml" => Some(Format::Yaml),
            "sql" => Some(Format::Sql),

            "pptx" => Some(Format::Pptx),
            "ppt" => Some(Format::Ppt),
            "odp" => Some(Format::Odp),
            "key" => Some(Format::Key),

            "jpg" | "jpeg" => Some(Format::Jpg),
            "png" => Some(Format::Png),
            "webp" => Some(Format::Webp),
            "avif" => Some(Format::Avif),
            "gif" => Some(Format::Gif),
            "tif" | "tiff" => Some(Format::Tiff),
            "bmp" => Some(Format::Bmp),
            "ico" => Some(Format::Ico),
            "heic" => Some(Format::Heic),
            "heif" => Some(Format::Heif),
            "cr2" => Some(Format::Cr2),
            "nef" => Some(Format::Nef),
            "arw" => Some(Format::Arw),
            "psd" => Some(Format::Psd),
            "svg" => Some(Format::Svg),
            "eps" => Some(Format::Eps),
            "ai" => Some(Format::Ai),
            "emf" => Some(Format::Emf),
            "wmf" => Some(Format::Wmf),

            "mp3" => Some(Format::Mp3),
            "wav" => Some(Format::Wav),
            "flac" => Some(Format::Flac),
            "aac" => Some(Format::Aac),
            "ogg" | "oga" => Some(Format::Ogg),
            "m4a" => Some(Format::M4a),
            "wma" => Some(Format::Wma),
            "aiff" | "aif" => Some(Format::Aiff),
            "opus" => Some(Format::Opus),
            "amr" => Some(Format::Amr),

            "mp4" => Some(Format::Mp4),
            "mkv" => Some(Format::Mkv),
            "avi" => Some(Format::Avi),
            "mov" => Some(Format::Mov),
            "webm" => Some(Format::Webm),
            "flv" => Some(Format::Flv),
            "wmv" => Some(Format::Wmv),
            "mpeg" | "mpg" => Some(Format::Mpeg),
            "3gp" => Some(Format::ThreeGp),
            "srt" => Some(Format::Srt),
            "vtt" => Some(Format::Vtt),

            "epub" => Some(Format::Epub),
            "mobi" => Some(Format::Mobi),
            "azw3" => Some(Format::Azw3),
            "fb2" => Some(Format::Fb2),
            "lit" => Some(Format::Lit),
            "lrf" => Some(Format::Lrf),
            "cbr" => Some(Format::Cbr),
            "cbz" => Some(Format::Cbz),

            "zip" => Some(Format::Zip),
            "rar" => Some(Format::Rar),
            "7z" => Some(Format::SevenZ),
            "tar" => Some(Format::Tar),
            "gz" | "tgz" => Some(Format::Gz),
            "bz2" | "tbz2" => Some(Format::Bz2),
            "xz" | "txz" => Some(Format::Xz),
            "iso" => Some(Format::Iso),

            "ttf" => Some(Format::Ttf),
            "otf" => Some(Format::Otf),
            "woff" => Some(Format::Woff),
            "woff2" => Some(Format::Woff2),
            "eot" => Some(Format::Eot),
            "stl" => Some(Format::Stl),
            "obj" => Some(Format::Obj),
            "fbx" => Some(Format::Fbx),
            "gltf" | "glb" => Some(Format::Gltf),
            "dxf" => Some(Format::Dxf),
            "dwg" => Some(Format::Dwg),

            _ => None,
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Format::Pdf => "pdf",
            Format::Docx => "docx",
            Format::Doc => "doc",
            Format::Odt => "odt",
            Format::Rtf => "rtf",
            Format::Txt => "txt",
            Format::Md => "md",
            Format::Html => "html",
            Format::Xhtml => "xhtml",
            Format::Tex => "tex",
            Format::Rst => "rst",
            Format::Wpd => "wpd",

            Format::Xlsx => "xlsx",
            Format::Xls => "xls",
            Format::Csv => "csv",
            Format::Tsv => "tsv",
            Format::Ods => "ods",
            Format::Dbf => "dbf",
            Format::Sqlite => "sqlite",
            Format::Parquet => "parquet",
            Format::Json => "json",
            Format::Yaml => "yaml",
            Format::Sql => "sql",

            Format::Pptx => "pptx",
            Format::Ppt => "ppt",
            Format::Odp => "odp",
            Format::Key => "key",

            Format::Jpg => "jpg",
            Format::Png => "png",
            Format::Webp => "webp",
            Format::Avif => "avif",
            Format::Gif => "gif",
            Format::Tiff => "tiff",
            Format::Bmp => "bmp",
            Format::Ico => "ico",
            Format::Heic => "heic",
            Format::Heif => "heif",
            Format::Cr2 => "cr2",
            Format::Nef => "nef",
            Format::Arw => "arw",
            Format::Psd => "psd",
            Format::Svg => "svg",
            Format::Eps => "eps",
            Format::Ai => "ai",
            Format::Emf => "emf",
            Format::Wmf => "wmf",

            Format::Mp3 => "mp3",
            Format::Wav => "wav",
            Format::Flac => "flac",
            Format::Aac => "aac",
            Format::Ogg => "ogg",
            Format::M4a => "m4a",
            Format::Wma => "wma",
            Format::Aiff => "aiff",
            Format::Opus => "opus",
            Format::Amr => "amr",

            Format::Mp4 => "mp4",
            Format::Mkv => "mkv",
            Format::Avi => "avi",
            Format::Mov => "mov",
            Format::Webm => "webm",
            Format::Flv => "flv",
            Format::Wmv => "wmv",
            Format::Mpeg => "mpeg",
            Format::ThreeGp => "3gp",
            Format::Srt => "srt",
            Format::Vtt => "vtt",

            Format::Epub => "epub",
            Format::Mobi => "mobi",
            Format::Azw3 => "azw3",
            Format::Fb2 => "fb2",
            Format::Lit => "lit",
            Format::Lrf => "lrf",
            Format::Cbr => "cbr",
            Format::Cbz => "cbz",

            Format::Zip => "zip",
            Format::Rar => "rar",
            Format::SevenZ => "7z",
            Format::Tar => "tar",
            Format::Gz => "gz",
            Format::Bz2 => "bz2",
            Format::Xz => "xz",
            Format::Iso => "iso",

            Format::Ttf => "ttf",
            Format::Otf => "otf",
            Format::Woff => "woff",
            Format::Woff2 => "woff2",
            Format::Eot => "eot",
            Format::Stl => "stl",
            Format::Obj => "obj",
            Format::Fbx => "fbx",
            Format::Gltf => "gltf",
            Format::Dxf => "dxf",
            Format::Dwg => "dwg",
        }
    }

    pub fn category(&self) -> FormatCategory {
        match self {
            Format::Pdf
            | Format::Docx
            | Format::Doc
            | Format::Odt
            | Format::Rtf
            | Format::Txt
            | Format::Md
            | Format::Html
            | Format::Xhtml
            | Format::Tex
            | Format::Rst
            | Format::Wpd => FormatCategory::Documents,

            Format::Xlsx
            | Format::Xls
            | Format::Csv
            | Format::Tsv
            | Format::Ods
            | Format::Dbf
            | Format::Sqlite
            | Format::Parquet
            | Format::Json
            | Format::Yaml
            | Format::Sql => FormatCategory::Spreadsheets,

            Format::Pptx | Format::Ppt | Format::Odp | Format::Key => FormatCategory::Presentations,

            Format::Jpg
            | Format::Png
            | Format::Webp
            | Format::Avif
            | Format::Gif
            | Format::Tiff
            | Format::Bmp
            | Format::Ico
            | Format::Heic
            | Format::Heif
            | Format::Cr2
            | Format::Nef
            | Format::Arw
            | Format::Psd
            | Format::Svg
            | Format::Eps
            | Format::Ai
            | Format::Emf
            | Format::Wmf => FormatCategory::Images,

            Format::Mp3
            | Format::Wav
            | Format::Flac
            | Format::Aac
            | Format::Ogg
            | Format::M4a
            | Format::Wma
            | Format::Aiff
            | Format::Opus
            | Format::Amr => FormatCategory::Audio,

            Format::Mp4
            | Format::Mkv
            | Format::Avi
            | Format::Mov
            | Format::Webm
            | Format::Flv
            | Format::Wmv
            | Format::Mpeg
            | Format::ThreeGp
            | Format::Srt
            | Format::Vtt => FormatCategory::Video,

            Format::Epub
            | Format::Mobi
            | Format::Azw3
            | Format::Fb2
            | Format::Lit
            | Format::Lrf
            | Format::Cbr
            | Format::Cbz => FormatCategory::Ebooks,

            Format::Zip
            | Format::Rar
            | Format::SevenZ
            | Format::Tar
            | Format::Gz
            | Format::Bz2
            | Format::Xz
            | Format::Iso => FormatCategory::Archives,

            Format::Ttf
            | Format::Otf
            | Format::Woff
            | Format::Woff2
            | Format::Eot
            | Format::Stl
            | Format::Obj
            | Format::Fbx
            | Format::Gltf
            | Format::Dxf
            | Format::Dwg => FormatCategory::FontsAndCad,
        }
    }

    pub fn is_text_like(&self) -> bool {
        matches!(
            self,
            Format::Txt
                | Format::Md
                | Format::Html
                | Format::Xhtml
                | Format::Tex
                | Format::Rst
                | Format::Rtf
                | Format::Csv
                | Format::Tsv
                | Format::Json
                | Format::Yaml
                | Format::Sql
                | Format::Svg
                | Format::Eps
                | Format::Srt
                | Format::Vtt
                | Format::Fb2
                | Format::Obj
                | Format::Dxf
        )
    }

    pub fn default_weight(&self) -> WorkloadWeight {
        match self.category() {
            FormatCategory::Video | FormatCategory::Ebooks => WorkloadWeight::Heavy,
            FormatCategory::Presentations | FormatCategory::FontsAndCad => WorkloadWeight::Heavy,
            FormatCategory::Images if matches!(self, Format::Psd | Format::Cr2 | Format::Nef | Format::Arw | Format::Pdf) => {
                WorkloadWeight::Heavy
            }
            FormatCategory::Documents if matches!(self, Format::Pdf | Format::Doc | Format::Docx | Format::Tex) => {
                WorkloadWeight::Heavy
            }
            FormatCategory::Archives if matches!(self, Format::Iso | Format::SevenZ | Format::Rar) => {
                WorkloadWeight::Heavy
            }
            _ => WorkloadWeight::Lightweight,
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            Format::Pdf => "application/pdf",
            Format::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Format::Doc => "application/msword",
            Format::Odt => "application/vnd.oasis.opendocument.text",
            Format::Rtf => "application/rtf",
            Format::Txt => "text/plain; charset=utf-8",
            Format::Md => "text/markdown; charset=utf-8",
            Format::Html => "text/html; charset=utf-8",
            Format::Xhtml => "application/xhtml+xml",
            Format::Tex => "application/x-tex",
            Format::Rst => "text/x-rst",
            Format::Wpd => "application/vnd.wordperfect",
            Format::Xlsx => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            Format::Xls => "application/vnd.ms-excel",
            Format::Csv => "text/csv; charset=utf-8",
            Format::Tsv => "text/tab-separated-values; charset=utf-8",
            Format::Ods => "application/vnd.oasis.opendocument.spreadsheet",
            Format::Dbf => "application/x-dbf",
            Format::Sqlite => "application/vnd.sqlite3",
            Format::Parquet => "application/vnd.apache.parquet",
            Format::Json => "application/json",
            Format::Yaml => "application/yaml",
            Format::Sql => "application/sql",
            Format::Pptx => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            Format::Ppt => "application/vnd.ms-powerpoint",
            Format::Odp => "application/vnd.oasis.opendocument.presentation",
            Format::Key => "application/vnd.apple.keynote",
            Format::Jpg => "image/jpeg",
            Format::Png => "image/png",
            Format::Webp => "image/webp",
            Format::Avif => "image/avif",
            Format::Gif => "image/gif",
            Format::Tiff => "image/tiff",
            Format::Bmp => "image/bmp",
            Format::Ico => "image/x-icon",
            Format::Heic => "image/heic",
            Format::Heif => "image/heif",
            Format::Svg => "image/svg+xml",
            Format::Eps => "application/postscript",
            Format::Mp3 => "audio/mpeg",
            Format::Wav => "audio/wav",
            Format::Flac => "audio/flac",
            Format::Aac => "audio/aac",
            Format::Ogg => "audio/ogg",
            Format::M4a => "audio/mp4",
            Format::Opus => "audio/opus",
            Format::Mp4 => "video/mp4",
            Format::Mkv => "video/x-matroska",
            Format::Avi => "video/x-msvideo",
            Format::Mov => "video/quicktime",
            Format::Webm => "video/webm",
            Format::Srt => "application/x-subrip",
            Format::Vtt => "text/vtt; charset=utf-8",
            Format::Epub => "application/epub+zip",
            Format::Zip => "application/zip",
            Format::SevenZ => "application/x-7z-compressed",
            Format::Tar => "application/x-tar",
            Format::Gz => "application/gzip",
            Format::Bz2 => "application/x-bzip2",
            Format::Xz => "application/x-xz",
            Format::Woff2 => "font/woff2",
            Format::Woff => "font/woff",
            Format::Ttf => "font/ttf",
            Format::Otf => "font/otf",
            Format::Gltf => "model/gltf+json",
            Format::Stl => "model/stl",
            Format::Obj => "model/obj",
            _ => "application/octet-stream",
        }
    }

    pub fn metadata(&self) -> FormatMetadata {
        FormatMetadata {
            id: *self,
            ext: self.extension(),
            label: match self {
                Format::ThreeGp => "3GP",
                Format::SevenZ => "7Z",
                Format::Sqlite => "SQLite (.db)",
                Format::Key => "KEY (Keynote)",
                Format::Tex => "TEX (LaTeX)",
                _ => self.extension(),
            },
            category: self.category(),
            mime: self.mime_type(),
            is_text_like: self.is_text_like(),
            default_weight: self.default_weight(),
        }
    }
}
