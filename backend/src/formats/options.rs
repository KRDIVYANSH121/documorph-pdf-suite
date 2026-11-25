use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LayoutMode {
    #[default]
    Editable,
    Flattened,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VideoCodec {
    #[default]
    Auto,
    H264,
    H265,
    Vp9,
    Av1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioCodec {
    #[default]
    Auto,
    Aac,
    Mp3,
    Opus,
    Flac,
    Pcm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BitrateMode {
    #[default]
    Vbr,
    Cbr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResolutionPreset {
    #[default]
    Original,
    R480p,
    R720p,
    R1080p,
    R4K,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioChannels {
    #[default]
    Original,
    Stereo,
    Mono,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubtitleMode {
    #[default]
    Keep,
    Strip,
    ExtractSrt,
    ExtractVtt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HardwareAccel {
    #[default]
    Auto,
    Cpu,
    Nvenc,
    Vaapi,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArchiveCompressionLevel {
    Store,
    Fast,
    #[default]
    Normal,
    Maximum,
    Ultra,
}

impl ArchiveCompressionLevel {
    pub fn sevenz_mx_flag(self) -> &'static str {
        match self {
            ArchiveCompressionLevel::Store => "-mx=0",
            ArchiveCompressionLevel::Fast => "-mx=1",
            ArchiveCompressionLevel::Normal => "-mx=5",
            ArchiveCompressionLevel::Maximum => "-mx=7",
            ArchiveCompressionLevel::Ultra => "-mx=9",
        }
    }

    pub fn flate2_level(self) -> u32 {
        match self {
            ArchiveCompressionLevel::Store => 0,
            ArchiveCompressionLevel::Fast => 1,
            ArchiveCompressionLevel::Normal => 6,
            ArchiveCompressionLevel::Maximum => 8,
            ArchiveCompressionLevel::Ultra => 9,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MediaOptions {
    #[serde(default)]
    pub video_codec: VideoCodec,
    #[serde(default)]
    pub audio_codec: AudioCodec,
    #[serde(default)]
    pub bitrate_mode: BitrateMode,
    pub video_bitrate_kbps: Option<u32>,
    pub audio_bitrate_kbps: Option<u32>,
    pub fps: Option<u8>,
    #[serde(default)]
    pub resolution: ResolutionPreset,
    #[serde(default)]
    pub channels: AudioChannels,
    #[serde(default)]
    pub subtitle_mode: SubtitleMode,
    #[serde(default)]
    pub hw_accel: HardwareAccel,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ArchiveOptions {
    pub password: Option<String>,
    #[serde(default)]
    pub compression_level: ArchiveCompressionLevel,
    #[serde(default)]
    pub selected_entries: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocumentOptions {
    pub dpi: Option<u16>,
    pub quality: Option<u8>,
    #[serde(default)]
    pub grayscale: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConversionOptions {
    #[serde(default)]
    pub layout_mode: LayoutMode,
    #[serde(default)]
    pub media: MediaOptions,
    #[serde(default)]
    pub archive: ArchiveOptions,
    #[serde(default)]
    pub document: DocumentOptions,
}

impl ConversionOptions {
    /// Clamps numeric fields strictly to safe operational ranges so malformed parameters
    /// cannot trigger excessive CPU/RAM allocation or invalid CLI values.
    pub fn sanitized(mut self) -> Self {
        if let Some(ref mut v_kbps) = self.media.video_bitrate_kbps {
            *v_kbps = (*v_kbps).clamp(100, 50_000);
        }
        if let Some(ref mut a_kbps) = self.media.audio_bitrate_kbps {
            *a_kbps = (*a_kbps).clamp(16, 1_536);
        }
        if let Some(ref mut fps) = self.media.fps {
            *fps = (*fps).clamp(1, 120);
        }
        if let Some(ref mut dpi) = self.document.dpi {
            *dpi = (*dpi).clamp(50, 600);
        }
        if let Some(ref mut q) = self.document.quality {
            *q = (*q).clamp(10, 100);
        }
        if let Some(ref pw) = self.archive.password {
            if pw.len() > 256 || pw.contains('\0') {
                self.archive.password = None;
            }
        }
        // Keep only sanitized entry filters (max 500 entries)
        self.archive.selected_entries.truncate(500);
        self
    }
}
