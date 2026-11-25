use super::{Format, FormatMetadata};
use crate::formats::options::LayoutMode;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineId {
    NativeRust,
    FFmpeg,
    LibreOffice,
    Pandoc,
    ImageMagick,
    Inkscape,
    Calibre,
    SevenZip,
    FontTools,
    AssimpCad,
    DataBridge,
}

impl EngineId {
    pub fn display_name(&self) -> &'static str {
        match self {
            EngineId::NativeRust => "Native Rust Engine",
            EngineId::FFmpeg => "FFmpeg",
            EngineId::LibreOffice => "LibreOffice Headless",
            EngineId::Pandoc => "Pandoc",
            EngineId::ImageMagick => "ImageMagick / libvips",
            EngineId::Inkscape => "Inkscape CLI",
            EngineId::Calibre => "Calibre (ebook-convert)",
            EngineId::SevenZip => "7-Zip / libarchive",
            EngineId::FontTools => "FontTools / woff2",
            EngineId::AssimpCad => "Assimp / LibreCAD",
            EngineId::DataBridge => "DuckDB / PyArrow Bridge",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FidelityProfile {
    Exact,
    Editable,
    Flattened,
    Lossy,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConversionEdge {
    pub from: Format,
    pub to: Format,
    pub engine: EngineId,
    pub cost: u32,
    pub fidelity: FidelityProfile,
    pub note: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanStep {
    pub from: Format,
    pub to: Format,
    pub engine: EngineId,
    pub engine_name: &'static str,
    pub fidelity: FidelityProfile,
    pub note: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConversionPlan {
    pub source: Format,
    pub target: Format,
    pub layout_mode: LayoutMode,
    pub total_cost: u32,
    pub steps: Vec<PlanStep>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphExport {
    pub formats: Vec<FormatMetadata>,
    pub reachable: HashMap<String, Vec<String>>,
    pub edge_count: usize,
}

#[derive(Clone, Eq, PartialEq)]
struct HeapState {
    cost: u32,
    node: Format,
}

impl Ord for HeapState {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .cost
            .cmp(&self.cost)
            .then_with(|| self.node.extension().cmp(other.node.extension()))
    }
}

impl PartialOrd for HeapState {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct CompatibilityGraph {
    adjacency: HashMap<Format, Vec<ConversionEdge>>,
    edge_count: usize,
}

impl CompatibilityGraph {
    pub fn build() -> Self {
        let mut g = Self {
            adjacency: HashMap::new(),
            edge_count: 0,
        };

        g.populate_document_edges();
        g.populate_spreadsheet_and_db_edges();
        g.populate_presentation_edges();
        g.populate_image_and_vector_edges();
        g.populate_audio_and_video_edges();
        g.populate_ebook_edges();
        g.populate_archive_edges();
        g.populate_font_and_cad_edges();
        g
    }

    fn add_edge(
        &mut self,
        from: Format,
        to: Format,
        engine: EngineId,
        cost: u32,
        fidelity: FidelityProfile,
        note: &'static str,
    ) {
        if from == to {
            return;
        }
        let list = self.adjacency.entry(from).or_default();
        // Avoid duplicate identical (to, engine) edges
        if !list.iter().any(|e| e.to == to && e.engine == engine && e.fidelity == fidelity) {
            list.push(ConversionEdge {
                from,
                to,
                engine,
                cost,
                fidelity,
                note,
            });
            self.edge_count += 1;
        }
    }

    fn add_clique(
        &mut self,
        formats: &[Format],
        engine: EngineId,
        cost: u32,
        fidelity: FidelityProfile,
        note: &'static str,
    ) {
        for &a in formats {
            for &b in formats {
                if a != b {
                    self.add_edge(a, b, engine, cost, fidelity, note);
                }
            }
        }
    }

    fn populate_document_edges(&mut self) {
        // Pure-Rust fast markup conversions
        self.add_edge(Format::Md, Format::Html, EngineId::NativeRust, 1, FidelityProfile::Exact, "Pure-Rust pulldown-cmark render");
        self.add_edge(Format::Md, Format::Xhtml, EngineId::NativeRust, 2, FidelityProfile::Exact, "Pure-Rust Markdown to XHTML");
        self.add_edge(Format::Md, Format::Txt, EngineId::NativeRust, 1, FidelityProfile::Exact, "Pure-Rust text strip");
        self.add_edge(Format::Html, Format::Txt, EngineId::NativeRust, 2, FidelityProfile::Lossy, "Pure-Rust HTML tag strip");
        self.add_edge(Format::Txt, Format::Html, EngineId::NativeRust, 2, FidelityProfile::Exact, "Pure-Rust preformatted HTML wrap");
        self.add_edge(Format::Txt, Format::Md, EngineId::NativeRust, 2, FidelityProfile::Exact, "Pure-Rust text to Markdown");

        // Pandoc rich markup <-> document graph
        let pandoc_set = [
            Format::Md,
            Format::Html,
            Format::Xhtml,
            Format::Tex,
            Format::Rst,
            Format::Docx,
            Format::Odt,
            Format::Rtf,
            Format::Txt,
            Format::Epub,
        ];
        self.add_clique(&pandoc_set, EngineId::Pandoc, 5, FidelityProfile::Editable, "Pandoc AST structural conversion");
        self.add_edge(Format::Tex, Format::Pdf, EngineId::Pandoc, 6, FidelityProfile::Editable, "Pandoc LaTeX typesetting to PDF");
        self.add_edge(Format::Md, Format::Pdf, EngineId::Pandoc, 6, FidelityProfile::Editable, "Pandoc Markdown to PDF");

        // LibreOffice Office Document suite
        let lo_inputs = [
            Format::Docx,
            Format::Doc,
            Format::Odt,
            Format::Rtf,
            Format::Txt,
            Format::Html,
            Format::Wpd,
        ];
        let lo_outputs = [Format::Pdf, Format::Docx, Format::Odt, Format::Rtf, Format::Txt, Format::Html];
        for &src in &lo_inputs {
            for &dst in &lo_outputs {
                if src != dst {
                    self.add_edge(src, dst, EngineId::LibreOffice, 7, FidelityProfile::Editable, "LibreOffice headless document engine");
                }
            }
        }

        // PDF -> Editable vs Flattened layouts
        self.add_edge(Format::Pdf, Format::Docx, EngineId::LibreOffice, 9, FidelityProfile::Editable, "Reconstruct editable DOCX text & layout");
        self.add_edge(Format::Pdf, Format::Odt, EngineId::LibreOffice, 9, FidelityProfile::Editable, "Reconstruct editable ODT");
        self.add_edge(Format::Pdf, Format::Rtf, EngineId::LibreOffice, 9, FidelityProfile::Editable, "Reconstruct editable RTF");
        self.add_edge(Format::Pdf, Format::Html, EngineId::LibreOffice, 8, FidelityProfile::Editable, "Convert PDF to HTML");
        self.add_edge(Format::Pdf, Format::Txt, EngineId::Calibre, 8, FidelityProfile::Lossy, "Extract PDF plain text");

        // Flattened fidelity path: PDF -> PNG -> PDF/DOCX/Images
        self.add_edge(Format::Pdf, Format::Png, EngineId::ImageMagick, 6, FidelityProfile::Flattened, "Rasterize PDF pages at high DPI");
        self.add_edge(Format::Pdf, Format::Jpg, EngineId::ImageMagick, 6, FidelityProfile::Flattened, "Rasterize PDF pages as JPEG");
        self.add_edge(Format::Pdf, Format::Webp, EngineId::ImageMagick, 6, FidelityProfile::Flattened, "Rasterize PDF pages as WebP");
        self.add_edge(Format::Pdf, Format::Tiff, EngineId::ImageMagick, 6, FidelityProfile::Flattened, "Rasterize PDF pages as multi-page TIFF");
        self.add_edge(Format::Pdf, Format::Svg, EngineId::Inkscape, 7, FidelityProfile::Editable, "Extract vector paths from PDF to SVG");
    }

    fn populate_spreadsheet_and_db_edges(&mut self) {
        // Pure-Rust fast structured data conversions
        let native_tabular = [Format::Csv, Format::Tsv, Format::Json];
        self.add_clique(&native_tabular, EngineId::NativeRust, 1, FidelityProfile::Exact, "Pure-Rust zero-copy tabular transform");

        // Pure-Rust SQLite (.db) -> CSV / JSON / SQL dump
        self.add_edge(Format::Sqlite, Format::Csv, EngineId::NativeRust, 2, FidelityProfile::Exact, "Pure-Rust SQLite table export to CSV");
        self.add_edge(Format::Sqlite, Format::Json, EngineId::NativeRust, 2, FidelityProfile::Exact, "Pure-Rust SQLite export to JSON");
        self.add_edge(Format::Sqlite, Format::Sql, EngineId::NativeRust, 2, FidelityProfile::Exact, "Pure-Rust SQLite schema & row SQL dump");

        // Pure-Rust CSV/JSON -> SQLite
        self.add_edge(Format::Csv, Format::Sqlite, EngineId::NativeRust, 3, FidelityProfile::Exact, "Pure-Rust CSV import to SQLite table");
        self.add_edge(Format::Json, Format::Sqlite, EngineId::NativeRust, 3, FidelityProfile::Exact, "Pure-Rust JSON import to SQLite");

        // LibreOffice Spreadsheets
        let lo_sheets = [Format::Xlsx, Format::Xls, Format::Ods, Format::Csv, Format::Dbf];
        for &src in &lo_sheets {
            for &dst in &[Format::Xlsx, Format::Ods, Format::Csv, Format::Pdf, Format::Html] {
                if src != dst {
                    self.add_edge(src, dst, EngineId::LibreOffice, 7, FidelityProfile::Editable, "LibreOffice Calc tabular conversion");
                }
            }
        }

        // Parquet <-> CSV/JSON/SQLite via DataBridge (DuckDB / PyArrow)
        let data_bridge = [Format::Parquet, Format::Csv, Format::Tsv, Format::Json, Format::Sqlite];
        self.add_clique(&data_bridge, EngineId::DataBridge, 6, FidelityProfile::Exact, "Columnar DuckDB/Parquet data bridge");
        self.add_edge(Format::Csv, Format::Yaml, EngineId::DataBridge, 4, FidelityProfile::Exact, "Tabular CSV to YAML");
        self.add_edge(Format::Json, Format::Yaml, EngineId::DataBridge, 4, FidelityProfile::Exact, "JSON to YAML");
        self.add_edge(Format::Yaml, Format::Json, EngineId::DataBridge, 4, FidelityProfile::Exact, "YAML to JSON");
    }

    fn populate_presentation_edges(&mut self) {
        let pres = [Format::Pptx, Format::Ppt, Format::Odp, Format::Key];
        for &src in &pres {
            for &dst in &[Format::Pdf, Format::Pptx, Format::Odp] {
                if src != dst {
                    self.add_edge(src, dst, EngineId::LibreOffice, 8, FidelityProfile::Editable, "LibreOffice Impress presentation conversion");
                }
            }
        }
    }

    fn populate_image_and_vector_edges(&mut self) {
        // Pure-Rust safe raster pipeline
        let native_raster = [
            Format::Jpg,
            Format::Png,
            Format::Webp,
            Format::Gif,
            Format::Bmp,
            Format::Tiff,
            Format::Ico,
        ];
        self.add_clique(&native_raster, EngineId::NativeRust, 1, FidelityProfile::Exact, "Pure-Rust memory-safe raster codec");

        // ImageMagick extended raster + RAW + PSD + AVIF + HEIC + PDF
        let magick_inputs = [
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
            Format::Eps,
            Format::Emf,
            Format::Wmf,
        ];
        let magick_outputs = [
            Format::Jpg,
            Format::Png,
            Format::Webp,
            Format::Avif,
            Format::Gif,
            Format::Tiff,
            Format::Bmp,
            Format::Ico,
            Format::Pdf,
        ];
        for &src in &magick_inputs {
            for &dst in &magick_outputs {
                if src != dst {
                    self.add_edge(src, dst, EngineId::ImageMagick, 4, FidelityProfile::Flattened, "ImageMagick / libvips rasterization & decoding");
                }
            }
        }

        // Vector graphics via Inkscape CLI
        let vectors = [Format::Svg, Format::Eps, Format::Ai, Format::Emf, Format::Wmf];
        for &src in &vectors {
            for &dst in &[Format::Svg, Format::Eps, Format::Pdf, Format::Png] {
                if src != dst {
                    let fid = if matches!(dst, Format::Png) {
                        FidelityProfile::Flattened
                    } else {
                        FidelityProfile::Editable
                    };
                    self.add_edge(src, dst, EngineId::Inkscape, 5, fid, "Inkscape CLI vector pipeline");
                }
            }
        }
        // Best-effort PSD -> SVG flattened or vector trace
        self.add_edge(Format::Psd, Format::Svg, EngineId::Inkscape, 9, FidelityProfile::Flattened, "Best-effort PSD layer/vector export to SVG");
    }

    fn populate_audio_and_video_edges(&mut self) {
        let audio = [
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
        ];
        self.add_clique(&audio, EngineId::FFmpeg, 3, FidelityProfile::Lossy, "FFmpeg audio transcoding");

        let video = [
            Format::Mp4,
            Format::Mkv,
            Format::Avi,
            Format::Mov,
            Format::Webm,
            Format::Flv,
            Format::Wmv,
            Format::Mpeg,
            Format::ThreeGp,
            Format::Gif,
        ];
        for &v in &video {
            for &v_out in &video {
                if v != v_out {
                    self.add_edge(v, v_out, EngineId::FFmpeg, 5, FidelityProfile::Lossy, "FFmpeg video container & codec transcode");
                }
            }
            // Video -> Audio extraction
            if v != Format::Gif {
                for &a_out in &audio {
                    self.add_edge(v, a_out, EngineId::FFmpeg, 4, FidelityProfile::Lossy, "FFmpeg extract audio stream");
                }
                // Video -> Frame snapshot / subtitles
                self.add_edge(v, Format::Png, EngineId::FFmpeg, 4, FidelityProfile::Flattened, "FFmpeg frame snapshot extraction");
                self.add_edge(v, Format::Jpg, EngineId::FFmpeg, 4, FidelityProfile::Flattened, "FFmpeg frame snapshot extraction");
                self.add_edge(v, Format::Srt, EngineId::FFmpeg, 3, FidelityProfile::Exact, "FFmpeg subtitle track extraction");
                self.add_edge(v, Format::Vtt, EngineId::FFmpeg, 3, FidelityProfile::Exact, "FFmpeg WebVTT subtitle extraction");
            }
        }

        // Subtitle cross-conversion
        self.add_edge(Format::Srt, Format::Vtt, EngineId::FFmpeg, 2, FidelityProfile::Exact, "FFmpeg subtitle convert");
        self.add_edge(Format::Vtt, Format::Srt, EngineId::FFmpeg, 2, FidelityProfile::Exact, "FFmpeg subtitle convert");
    }

    fn populate_ebook_edges(&mut self) {
        let ebooks = [
            Format::Epub,
            Format::Mobi,
            Format::Azw3,
            Format::Fb2,
            Format::Lit,
            Format::Lrf,
            Format::Cbr,
            Format::Cbz,
        ];
        let ebook_targets = [
            Format::Epub,
            Format::Mobi,
            Format::Azw3,
            Format::Fb2,
            Format::Pdf,
            Format::Html,
            Format::Txt,
        ];
        for &src in &ebooks {
            for &dst in &ebook_targets {
                if src != dst {
                    self.add_edge(src, dst, EngineId::Calibre, 6, FidelityProfile::Editable, "Calibre ebook-convert");
                }
            }
        }
        // Calibre also converts HTML / DOCX / RTF -> eBooks
        for &src in &[Format::Html, Format::Docx, Format::Rtf, Format::Txt, Format::Pdf] {
            for &dst in &[Format::Epub, Format::Mobi, Format::Azw3, Format::Fb2] {
                self.add_edge(src, dst, EngineId::Calibre, 7, FidelityProfile::Editable, "Calibre eBook publishing");
            }
        }
    }

    fn populate_archive_edges(&mut self) {
        // Pure-Rust safe archive conversions (ZIP <-> TAR <-> GZ)
        let native_archives = [Format::Zip, Format::Tar, Format::Gz];
        self.add_clique(&native_archives, EngineId::NativeRust, 2, FidelityProfile::Exact, "Pure-Rust zip-bomb-guarded archive repack");

        // 7-Zip cross-archive bridge (RAR, 7Z, ISO, BZ2, XZ, TAR, GZ, ZIP, CBR, CBZ)
        let all_archive_in = [
            Format::Zip,
            Format::Rar,
            Format::SevenZ,
            Format::Tar,
            Format::Gz,
            Format::Bz2,
            Format::Xz,
            Format::Iso,
            Format::Cbr,
            Format::Cbz,
        ];
        let all_archive_out = [
            Format::Zip,
            Format::SevenZ,
            Format::Tar,
            Format::Gz,
            Format::Bz2,
            Format::Xz,
            Format::Cbz,
        ];
        for &src in &all_archive_in {
            for &dst in &all_archive_out {
                if src != dst {
                    self.add_edge(src, dst, EngineId::SevenZip, 5, FidelityProfile::Exact, "7-Zip guarded cross-archive repack");
                }
            }
        }
    }

    fn populate_font_and_cad_edges(&mut self) {
        let fonts = [Format::Ttf, Format::Otf, Format::Woff, Format::Woff2, Format::Eot];
        self.add_clique(&fonts, EngineId::FontTools, 4, FidelityProfile::Exact, "FontTools / woff2 webfont transcode");

        // 3D models via Assimp
        let models = [Format::Stl, Format::Obj, Format::Fbx, Format::Gltf];
        self.add_clique(&models, EngineId::AssimpCad, 5, FidelityProfile::Exact, "Assimp 3D mesh transcode");

        // CAD drawings (DWG <-> DXF -> SVG / PDF / PNG)
        self.add_edge(Format::Dwg, Format::Dxf, EngineId::AssimpCad, 5, FidelityProfile::Editable, "LibreCAD / ODA DWG to DXF");
        self.add_edge(Format::Dxf, Format::Dwg, EngineId::AssimpCad, 6, FidelityProfile::Editable, "LibreCAD DXF to DWG");
        self.add_edge(Format::Dxf, Format::Svg, EngineId::AssimpCad, 5, FidelityProfile::Editable, "CAD DXF to vector SVG");
        self.add_edge(Format::Dxf, Format::Pdf, EngineId::AssimpCad, 6, FidelityProfile::Editable, "CAD DXF to blueprint PDF");
        self.add_edge(Format::Dxf, Format::Obj, EngineId::AssimpCad, 7, FidelityProfile::Editable, "CAD DXF extrusion to 3D OBJ");
    }

    /// Runs Dijkstra shortest-path routing with LayoutMode preference bias so
    /// Editable vs Flattened fidelity selects the most appropriate conversion chain.
    pub fn plan(&self, source: Format, target: Format, layout_mode: LayoutMode) -> Option<ConversionPlan> {
        if source == target {
            return None;
        }

        let mut dist: HashMap<Format, u32> = HashMap::new();
        let mut prev: HashMap<Format, ConversionEdge> = HashMap::new();
        let mut heap = BinaryHeap::new();

        dist.insert(source, 0);
        heap.push(HeapState {
            cost: 0,
            node: source,
        });

        while let Some(HeapState { cost, node }) = heap.pop() {
            if node == target {
                break;
            }
            if cost > *dist.get(&node).unwrap_or(&u32::MAX) {
                continue;
            }
            if let Some(edges) = self.adjacency.get(&node) {
                for edge in edges {
                    // Apply slight bias based on LayoutMode preference
                    let mode_penalty = match (layout_mode, edge.fidelity) {
                        (LayoutMode::Flattened, FidelityProfile::Editable) => 4,
                        (LayoutMode::Editable, FidelityProfile::Flattened) => 5,
                        _ => 0,
                    };
                    let next_cost = cost.saturating_add(edge.cost).saturating_add(mode_penalty);
                    let best = *dist.get(&edge.to).unwrap_or(&u32::MAX);
                    if next_cost < best {
                        dist.insert(edge.to, next_cost);
                        prev.insert(edge.to, edge.clone());
                        heap.push(HeapState {
                            cost: next_cost,
                            node: edge.to,
                        });
                    }
                }
            }
        }

        if !prev.contains_key(&target) {
            return None;
        }

        let mut steps_rev = Vec::new();
        let mut cur = target;
        while cur != source {
            let edge = prev.get(&cur)?.clone();
            cur = edge.from;
            steps_rev.push(PlanStep {
                from: edge.from,
                to: edge.to,
                engine: edge.engine,
                engine_name: edge.engine.display_name(),
                fidelity: edge.fidelity,
                note: edge.note,
            });
        }
        steps_rev.reverse();

        // Reject excessively long chained pipelines (> 4 hops) for reliability
        if steps_rev.len() > 4 {
            return None;
        }

        Some(ConversionPlan {
            source,
            target,
            layout_mode,
            total_cost: dist[&target],
            steps: steps_rev,
        })
    }

    pub fn reachable_targets(&self, source: Format) -> Vec<Format> {
        let mut visited = HashSet::new();
        let mut queue = std::collections::VecDeque::new();
        visited.insert(source);
        queue.push_back((source, 0usize));

        while let Some((node, depth)) = queue.pop_front() {
            if depth >= 4 {
                continue;
            }
            if let Some(edges) = self.adjacency.get(&node) {
                for edge in edges {
                    if visited.insert(edge.to) {
                        queue.push_back((edge.to, depth + 1));
                    }
                }
            }
        }
        visited.remove(&source);
        let mut out: Vec<Format> = visited.into_iter().collect();
        out.sort_by_key(|f| f.extension());
        out
    }

    pub fn export_for_ui(&self) -> GraphExport {
        let mut reachable = HashMap::new();
        for &fmt in Format::ALL {
            let targets: Vec<String> = self
                .reachable_targets(fmt)
                .into_iter()
                .map(|t| t.extension().to_string())
                .collect();
            reachable.insert(fmt.extension().to_string(), targets);
        }
        GraphExport {
            formats: Format::ALL.iter().map(|f| f.metadata()).collect(),
            reachable,
            edge_count: self.edge_count,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn impossible_conversions_are_blocked() {
        let g = CompatibilityGraph::build();
        assert!(g.plan(Format::Mp3, Format::Xlsx, LayoutMode::Editable).is_none());
        assert!(g.plan(Format::Mp4, Format::Sqlite, LayoutMode::Editable).is_none());
        assert!(g.plan(Format::Woff2, Format::Mp3, LayoutMode::Editable).is_none());
    }

    #[test]
    fn chained_pipelines_resolve_correctly() {
        let g = CompatibilityGraph::build();
        // DWG -> GLTF via DWG -> DXF -> OBJ -> GLTF
        let cad_plan = g.plan(Format::Dwg, Format::Gltf, LayoutMode::Editable);
        assert!(cad_plan.is_some());
        let steps = cad_plan.unwrap().steps;
        assert!(steps.len() >= 2);
        assert_eq!(steps.first().unwrap().from, Format::Dwg);
        assert_eq!(steps.last().unwrap().to, Format::Gltf);

        // RAR -> TAR via 7z/chained
        let archive_plan = g.plan(Format::Rar, Format::Tar, LayoutMode::Editable);
        assert!(archive_plan.is_some());
    }
}
