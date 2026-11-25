import React, { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  ShieldCheck,
  Server,
  ArrowRight,
  Sliders,
  Film,
  Archive,
  FileText,
  Sparkles,
  Loader2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Layers,
  Eye,
  Zap,
  Flame,
  HardDrive,
  PanelLeftOpen,
  X,
  Search,
} from 'lucide-react';
import { DropZone } from './DropZone';
import { formatBytes, triggerConfetti } from '../utils/fileHelpers';

type FormatCategory =
  | 'documents'
  | 'spreadsheets'
  | 'presentations'
  | 'images'
  | 'audio'
  | 'video'
  | 'ebooks'
  | 'archives'
  | 'fonts_and_cad';

interface FormatMetadata {
  id: string;
  ext: string;
  label: string;
  category: FormatCategory;
  mime: string;
  is_text_like: boolean;
  default_weight: 'lightweight' | 'heavy';
}

interface GraphExport {
  formats: FormatMetadata[];
  reachable: Record<string, string[]>;
  edge_count: number;
}

interface PlanStep {
  from: string;
  to: string;
  engine: string;
  engine_name: string;
  fidelity: string;
  note: string;
}

interface ConversionPlan {
  source: string;
  target: string;
  layout_mode: 'editable' | 'flattened';
  total_cost: number;
  steps: PlanStep[];
}

interface HealthResponse {
  status: string;
  sandbox_mode: string;
  max_upload_mb: number;
  engines: Record<string, boolean>;
  queues: {
    lightweight_pending: number;
    heavy_pending: number;
    total_tracked_jobs: number;
  };
}

interface ArchiveEntryInfo {
  path: string;
  compressed_bytes: number;
  uncompressed_bytes: number;
  is_dir: boolean;
  encrypted: boolean;
}

interface ArchiveInspection {
  total_entries: number;
  total_uncompressed_bytes: number;
  total_compressed_bytes: number;
  max_ratio: number;
  has_encrypted_entries: boolean;
  entries: ArchiveEntryInfo[];
}

const CATEGORY_LABELS: { id: FormatCategory; label: string }[] = [
  { id: 'documents', label: 'Documents & Markup' },
  { id: 'spreadsheets', label: 'Spreadsheets & DB' },
  { id: 'presentations', label: 'Presentations' },
  { id: 'images', label: 'Raster & Vector' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video & Subtitles' },
  { id: 'ebooks', label: 'eBooks' },
  { id: 'archives', label: 'Archives' },
  { id: 'fonts_and_cad', label: 'Fonts & 3D/CAD' },
];

const FALLBACK_FORMATS: FormatMetadata[] = [
  ...['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'html', 'xhtml', 'tex', 'rst', 'wpd'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'documents' as FormatCategory,
    mime: 'application/octet-stream',
    is_text_like: ['txt', 'md', 'html', 'xhtml', 'tex', 'rst', 'rtf'].includes(ext),
    default_weight: ['pdf', 'doc', 'docx', 'tex'].includes(ext) ? ('heavy' as const) : ('lightweight' as const),
  })),
  ...['xlsx', 'xls', 'csv', 'tsv', 'ods', 'dbf', 'sqlite', 'parquet', 'json', 'yaml', 'sql'].map((ext) => ({
    id: ext,
    ext,
    label: ext === 'sqlite' ? 'SQLite (.db)' : ext.toUpperCase(),
    category: 'spreadsheets' as FormatCategory,
    mime: 'application/octet-stream',
    is_text_like: ['csv', 'tsv', 'json', 'yaml', 'sql'].includes(ext),
    default_weight: ['xlsx', 'xls', 'ods', 'parquet'].includes(ext) ? ('heavy' as const) : ('lightweight' as const),
  })),
  ...['pptx', 'ppt', 'odp', 'key'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'presentations' as FormatCategory,
    mime: 'application/octet-stream',
    is_text_like: false,
    default_weight: 'heavy' as const,
  })),
  ...['jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'bmp', 'ico', 'heic', 'heif', 'cr2', 'nef', 'arw', 'psd', 'svg', 'eps', 'ai', 'emf', 'wmf'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'images' as FormatCategory,
    mime: 'image/*',
    is_text_like: ['svg', 'eps'].includes(ext),
    default_weight: ['psd', 'cr2', 'nef', 'arw'].includes(ext) ? ('heavy' as const) : ('lightweight' as const),
  })),
  ...['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'aiff', 'opus', 'amr'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'audio' as FormatCategory,
    mime: 'audio/*',
    is_text_like: false,
    default_weight: 'lightweight' as const,
  })),
  ...['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'mpeg', '3gp', 'srt', 'vtt'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'video' as FormatCategory,
    mime: 'video/*',
    is_text_like: ['srt', 'vtt'].includes(ext),
    default_weight: 'heavy' as const,
  })),
  ...['epub', 'mobi', 'azw3', 'fb2', 'lit', 'lrf', 'cbr', 'cbz'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'ebooks' as FormatCategory,
    mime: 'application/octet-stream',
    is_text_like: ext === 'fb2',
    default_weight: 'heavy' as const,
  })),
  ...['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'archives' as FormatCategory,
    mime: 'application/octet-stream',
    is_text_like: false,
    default_weight: ['7z', 'rar', 'iso'].includes(ext) ? ('heavy' as const) : ('lightweight' as const),
  })),
  ...['ttf', 'otf', 'woff', 'woff2', 'eot', 'stl', 'obj', 'fbx', 'gltf', 'dxf', 'dwg'].map((ext) => ({
    id: ext,
    ext,
    label: ext.toUpperCase(),
    category: 'fonts_and_cad' as FormatCategory,
    mime: 'application/octet-stream',
    is_text_like: ['obj', 'dxf'].includes(ext),
    default_weight: 'heavy' as const,
  })),
];

function computeFallbackReachable(ext: string): string[] {
  const fmt = FALLBACK_FORMATS.find((f) => f.ext === ext);
  if (!fmt) return [];
  switch (fmt.category) {
    case 'documents':
      return ['pdf', 'docx', 'odt', 'rtf', 'txt', 'md', 'html', 'xhtml', 'tex', 'rst', 'epub', 'png', 'jpg'].filter((t) => t !== ext);
    case 'spreadsheets':
      if (ext === 'sqlite') return ['csv', 'tsv', 'json', 'sql', 'parquet'];
      if (ext === 'sql') return [];
      return ['xlsx', 'ods', 'csv', 'tsv', 'json', 'yaml', 'sqlite', 'parquet', 'pdf', 'html'].filter((t) => t !== ext);
    case 'presentations':
      return ['pdf', 'pptx', 'odp', 'png', 'jpg'].filter((t) => t !== ext);
    case 'images':
      if (['svg', 'eps', 'ai', 'emf', 'wmf'].includes(ext)) return ['svg', 'eps', 'pdf', 'png', 'jpg', 'webp'].filter((t) => t !== ext);
      return ['jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'bmp', 'ico', 'pdf', ...(ext === 'psd' ? ['svg'] : [])].filter((t) => t !== ext);
    case 'audio':
      return ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'aiff', 'opus', 'amr'].filter((t) => t !== ext);
    case 'video':
      if (['srt', 'vtt'].includes(ext)) return ['srt', 'vtt'].filter((t) => t !== ext);
      return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'mpeg', '3gp', 'gif', 'mp3', 'wav', 'aac', 'png', 'jpg', 'srt', 'vtt'].filter((t) => t !== ext);
    case 'ebooks':
      return ['epub', 'mobi', 'azw3', 'fb2', 'pdf', 'html', 'txt', 'docx'].filter((t) => t !== ext);
    case 'archives':
      return ['zip', '7z', 'tar', 'gz', 'bz2', 'xz', 'cbz'].filter((t) => t !== ext);
    case 'fonts_and_cad':
      if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) return ['ttf', 'otf', 'woff', 'woff2', 'eot'].filter((t) => t !== ext);
      if (['dxf', 'dwg'].includes(ext)) return ['dxf', 'dwg', 'svg', 'pdf', 'obj', 'gltf', 'stl'].filter((t) => t !== ext);
      return ['stl', 'obj', 'fbx', 'gltf'].filter((t) => t !== ext);
  }
}

export const OmniConverterTool: React.FC = () => {
  const defaultApiBase =
    typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')
      ? 'http://localhost:8080'
      : '';
  const [apiBase, setApiBase] = useState<string>(defaultApiBase);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [graph, setGraph] = useState<GraphExport | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [formatSearch, setFormatSearch] = useState<string>('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceExt, setSourceExt] = useState<string>('md');
  const [targetExt, setTargetExt] = useState<string>('html');
  const [activeCategory, setActiveCategory] = useState<FormatCategory>('documents');
  const [plan, setPlan] = useState<ConversionPlan | null>(null);

  // Format-specific controls
  const [layoutMode, setLayoutMode] = useState<'editable' | 'flattened'>('editable');
  const [videoCodec, setVideoCodec] = useState<string>('auto');
  const [audioCodec, setAudioCodec] = useState<string>('auto');
  const [bitrateMode, setBitrateMode] = useState<string>('vbr');
  const [videoBitrate, setVideoBitrate] = useState<string>('');
  const [audioBitrate, setAudioBitrate] = useState<string>('');
  const [fps, setFps] = useState<string>('');
  const [resolution, setResolution] = useState<string>('original');
  const [channels, setChannels] = useState<string>('original');
  const [subtitleMode, setSubtitleMode] = useState<string>('keep');
  const [hwAccel, setHwAccel] = useState<string>('auto');

  const [archivePassword, setArchivePassword] = useState<string>('');
  const [compressionLevel, setCompressionLevel] = useState<string>('normal');
  const [archiveInspection, setArchiveInspection] = useState<ArchiveInspection | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [isInspecting, setIsInspecting] = useState<boolean>(false);

  const [dpi, setDpi] = useState<number>(150);
  const [quality, setQuality] = useState<number>(88);
  const [grayscale, setGrayscale] = useState<boolean>(false);

  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobStatusText, setJobStatusText] = useState<string>('');
  const [completedJob, setCompletedJob] = useState<{
    jobId: string;
    filename: string;
    size: number;
    sha256: string;
    elapsedMs: number;
    lane: string;
  } | null>(null);

  const baseUrl = apiBase.replace(/\/$/, '');

  useEffect(() => {
    let cancelled = false;
    const fetchMeta = async () => {
      try {
        const [hRes, gRes] = await Promise.all([
          fetch(`${baseUrl}/api/v1/health`),
          fetch(`${baseUrl}/api/v1/formats/graph`),
        ]);
        if (!cancelled && hRes.ok && gRes.ok) {
          const hData: HealthResponse = await hRes.json();
          const gData: GraphExport = await gRes.json();
          setHealth(hData);
          setGraph(gData);
          setBackendOnline(true);
        } else if (!cancelled) {
          setBackendOnline(false);
        }
      } catch {
        if (!cancelled) setBackendOnline(false);
      }
    };
    fetchMeta();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const formats = graph?.formats ?? FALLBACK_FORMATS;
  const reachableTargets = useMemo(() => {
    if (graph?.reachable[sourceExt]) {
      return new Set(graph.reachable[sourceExt]);
    }
    return new Set(computeFallbackReachable(sourceExt));
  }, [graph, sourceExt]);

  useEffect(() => {
    if (!reachableTargets.has(targetExt)) {
      const first = Array.from(reachableTargets)[0];
      if (first) setTargetExt(first);
    }
  }, [sourceExt, reachableTargets, targetExt]);

  useEffect(() => {
    if (!sourceExt || !targetExt || sourceExt === targetExt) {
      setPlan(null);
      return;
    }
    if (!backendOnline) {
      if (reachableTargets.has(targetExt)) {
        setPlan({
          source: sourceExt,
          target: targetExt,
          layout_mode: layoutMode,
          total_cost: 2,
          steps: [
            {
              from: sourceExt,
              to: targetExt,
              engine: 'smart_router',
              engine_name: 'Smart Format Router',
              fidelity: layoutMode,
              note: 'Connect conversion server to execute',
            },
          ],
        });
      } else {
        setPlan(null);
      }
      return;
    }

    let cancelled = false;
    fetch(`${baseUrl}/api/v1/plan?from=${encodeURIComponent(sourceExt)}&to=${encodeURIComponent(targetExt)}&layout=${layoutMode}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch(() => {
        if (!cancelled) setPlan(null);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, backendOnline, sourceExt, targetExt, layoutMode, reachableTargets]);

  const handleFileSelected = (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setSelectedFile(f);
    setCompletedJob(null);
    setJobError(null);
    setArchiveInspection(null);
    setSelectedEntries([]);

    const rawExt = f.name.split('.').pop()?.toLowerCase() ?? '';
    const normExt = rawExt === 'jpeg' ? 'jpg' : rawExt === 'db' || rawExt === 'sqlite3' ? 'sqlite' : rawExt;
    const matched = formats.find((item) => item.ext === normExt);
    if (matched) {
      setSourceExt(matched.ext);
      setActiveCategory(matched.category);
    }
  };

  const handleInspectArchive = async () => {
    if (!selectedFile || !backendOnline) return;
    setIsInspecting(true);
    setJobError(null);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      if (archivePassword) fd.append('password', archivePassword);
      const res = await fetch(`${baseUrl}/api/v1/archive/inspect`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Archive security inspection failed');
      }
      setArchiveInspection(data);
    } catch (e: any) {
      setJobError(e.message || 'Archive inspection failed');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleConvert = async () => {
    if (!selectedFile) return;
    if (!backendOnline) {
      setJobError(
        'Conversion server is not reachable at ' +
          (baseUrl || window.location.origin) +
          '. Start the conversion service to run this conversion.'
      );
      return;
    }

    setIsConverting(true);
    setJobError(null);
    setCompletedJob(null);
    setJobStatusText('Uploading & running magic-byte / zip-bomb security checks...');

    try {
      const optionsPayload = {
        layout_mode: layoutMode,
        media: {
          video_codec: videoCodec,
          audio_codec: audioCodec,
          bitrate_mode: bitrateMode,
          video_bitrate_kbps: videoBitrate ? parseInt(videoBitrate, 10) : null,
          audio_bitrate_kbps: audioBitrate ? parseInt(audioBitrate, 10) : null,
          fps: fps ? parseInt(fps, 10) : null,
          resolution,
          channels,
          subtitle_mode: subtitleMode,
          hw_accel: hwAccel,
        },
        archive: {
          password: archivePassword || null,
          compression_level: compressionLevel,
          selected_entries: selectedEntries,
        },
        document: {
          dpi,
          quality,
          grayscale,
        },
      };

      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('source_format', sourceExt);
      fd.append('target_format', targetExt);
      fd.append('options', JSON.stringify(optionsPayload));

      const submitRes = await fetch(`${baseUrl}/api/v1/convert`, {
        method: 'POST',
        body: fd,
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(submitData.message || 'Conversion rejected');
      }

      const jobId = submitData.job_id;
      const lane = submitData.lane;
      setJobStatusText(`Queued in ${lane} lane...`);

      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 450));
        const stRes = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`);
        const stData = await stRes.json();
        if (!stRes.ok) {
          throw new Error(stData.message || 'Failed to poll job status');
        }

        if (stData.status === 'queued') {
          setJobStatusText(`Queued in ${stData.lane} worker lane...`);
        } else if (stData.status === 'running') {
          setJobStatusText(stData.step_label || 'Running conversion...');
        } else if (stData.status === 'completed') {
          done = true;
          setCompletedJob({
            jobId,
            filename: stData.output_filename,
            size: stData.output_size,
            sha256: stData.sha256,
            elapsedMs: stData.elapsed_ms,
            lane: stData.lane,
          });
          triggerConfetti();
        } else if (stData.status === 'failed') {
          throw new Error(stData.reason || 'Conversion failed');
        }
      }
    } catch (err: any) {
      setJobError(err.message || 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  const srcMeta = formats.find((f) => f.ext === sourceExt);
  const dstMeta = formats.find((f) => f.ext === targetExt);
  const isMediaContext =
    srcMeta?.category === 'video' ||
    srcMeta?.category === 'audio' ||
    dstMeta?.category === 'video' ||
    dstMeta?.category === 'audio';
  const isArchiveContext = srcMeta?.category === 'archives' || dstMeta?.category === 'archives';
  const isComplexLayoutContext =
    (srcMeta?.ext === 'pdf' && ['docx', 'odt', 'rtf', 'html', 'png', 'jpg'].includes(targetExt)) ||
    (srcMeta?.ext === 'psd' && targetExt === 'svg');

  const searchTerm = formatSearch.trim().toLowerCase();
  const filteredCategoryFormats = formats.filter(
    (f) =>
      (searchTerm ? f.ext.includes(searchTerm) || f.label.toLowerCase().includes(searchTerm) : f.category === activeCategory)
  );
  const filteredReachableTargets = formats.filter(
    (f) =>
      reachableTargets.has(f.ext) &&
      (!searchTerm || f.ext.includes(searchTerm) || f.label.toLowerCase().includes(searchTerm))
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Red & White Omni-Converter Header */}
      <div className="bg-gradient-to-r from-red-600 via-red-600 to-rose-600 text-white rounded-2xl p-6 border border-red-500 shadow-lg shadow-red-600/15 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="w-5 h-5 text-white" />
            <h2 className="text-xl font-bold">Universal Omni-Converter</h2>
            <span
              className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${
                backendOnline
                  ? 'bg-white text-red-700 border-white'
                  : 'bg-red-800/60 text-red-100 border-red-400/50'
              }`}
            >
              {backendOnline ? '● Service Online' : '○ Preview Mode'}
            </span>
          </div>
          <p className="text-xs text-red-100 max-w-2xl">
            Convert 90+ formats across 9 categories with automatic multi-step routing, format-specific controls, and built-in security checks.
          </p>
        </div>

        {/* Server Endpoint + Click-Open Formats Sidebar Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-2 bg-white/15 border border-white/25 rounded-xl px-3 py-1.5 backdrop-blur-sm">
            <Server className="w-3.5 h-3.5 text-white shrink-0" />
            <input
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="Same origin (or http://localhost:8080)"
              className="bg-transparent text-xs text-white placeholder-red-200 focus:outline-none w-48"
              aria-label="Conversion Server URL"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="px-4 py-2 rounded-xl bg-white text-red-600 hover:bg-red-50 font-bold text-xs shadow-sm flex items-center gap-2 transition-all"
          >
            <PanelLeftOpen className="w-4 h-4" />
            <span>Open Formats Sidebar</span>
          </button>
        </div>
      </div>

      {/* Live Queue Status Bar */}
      {health && (
        <div className="bg-red-50/60 dark:bg-neutral-800/60 border border-red-100 dark:border-red-900/50 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
            <ShieldCheck className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span>Conversion Service Ready • Max Upload: {health.max_upload_mb} MB</span>
          </div>
          <div className="text-red-700 dark:text-red-300 font-mono font-semibold">
            Fast Queue: {health.queues.lightweight_pending} • Heavy Queue: {health.queues.heavy_pending}
          </div>
        </div>
      )}

      {/* Main Two-Column Converter Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Upload + Compact Format Selector Bar + Pipeline Route */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedFile ? (
            <DropZone
              onFilesSelected={handleFileSelected}
              accept="*/*"
              multiple={false}
              title="Drop Any File Into the Omni-Converter"
              subtitle="Supports Documents, Spreadsheets, SQLite, Images, RAW, Audio, Video, eBooks, Archives, Fonts & 3D/CAD."
              icon={<Layers className="w-8 h-8" />}
            />
          ) : (
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-red-100 dark:border-red-900/50 p-5 flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center space-x-3 truncate">
                <div className="px-3 py-2 rounded-xl bg-red-600 text-white font-bold text-xs uppercase">
                  {sourceExt}
                </div>
                <div className="truncate">
                  <p className="font-bold text-sm text-neutral-900 dark:text-white truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatBytes(selectedFile.size)} • Source Format: {sourceExt.toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setCompletedJob(null);
                  setArchiveInspection(null);
                }}
                className="text-xs px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-semibold shrink-0"
              >
                Change File
              </button>
            </div>
          )}

          {/* Compact Selected Conversion Bar + Click-Open Sidebar Trigger */}
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-red-100 dark:border-red-900/50 p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-bold text-sm flex items-center gap-2 transition-colors"
                >
                  <span>From: {sourceExt.toUpperCase()}</span>
                </button>
                <ArrowRight className="w-4 h-4 text-red-600 shrink-0" />
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center gap-2 shadow-sm shadow-red-600/20 transition-colors"
                >
                  <span>To: {targetExt.toUpperCase()}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4" />
                <span>Browse All Formats ({reachableTargets.size} valid targets)</span>
              </button>
            </div>

            {/* Chained Pipeline Route Display */}
            {plan && (
              <div className="bg-red-50/50 dark:bg-neutral-900/80 rounded-xl p-4 border border-red-100 dark:border-red-900/40 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-red-600" />
                    Chained Conversion Route ({plan.steps.length}{' '}
                    {plan.steps.length === 1 ? 'hop' : 'hops'})
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                    {srcMeta?.default_weight === 'lightweight' &&
                    dstMeta?.default_weight === 'lightweight' &&
                    plan.steps.every((s) => s.engine === 'native_rust') ? (
                      <>
                        <Zap className="w-3 h-3" /> Lightweight Lane (&lt;1s)
                      </>
                    ) : (
                      <>
                        <Flame className="w-3 h-3" /> Heavy Processing Queue
                      </>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-red-200 dark:border-red-800 font-mono text-xs font-bold text-red-700 dark:text-red-300">
                    {plan.source.toUpperCase()}
                  </span>
                  {plan.steps.map((step, i) => (
                    <React.Fragment key={i}>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <ArrowRight className="w-3.5 h-3.5 text-red-500" />
                        <span className="px-2 py-0.5 rounded bg-white dark:bg-neutral-800 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-300 text-[10px] font-bold">
                          {step.engine_name}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-red-500" />
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-red-200 dark:border-red-800 font-mono text-xs font-bold text-red-700 dark:text-red-300">
                        {step.to.toUpperCase()}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Archive Security Inspector Table */}
          {archiveInspection && (
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-red-100 dark:border-red-900/50 p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-red-600" />
                  Zip-Bomb & Archive Pre-Inspection Passed
                </h4>
                <span className="text-xs font-mono text-neutral-500">
                  {archiveInspection.total_entries} entries • Uncompressed:{' '}
                  {formatBytes(archiveInspection.total_uncompressed_bytes)} • Max Ratio:{' '}
                  {archiveInspection.max_ratio}:1
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto border border-red-100 dark:border-neutral-700 rounded-xl divide-y divide-red-50 dark:divide-neutral-700/60">
                {archiveInspection.entries
                  .filter((e) => !e.is_dir)
                  .map((entry) => {
                    const checked = selectedEntries.includes(entry.path);
                    return (
                      <label
                        key={entry.path}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-red-50/40 dark:hover:bg-neutral-900/50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEntries((prev) => [...prev, entry.path]);
                              } else {
                                setSelectedEntries((prev) => prev.filter((p) => p !== entry.path));
                              }
                            }}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <span className="font-mono truncate">{entry.path}</span>
                          {entry.encrypted && <Lock className="w-3 h-3 text-red-500 shrink-0" />}
                        </div>
                        <span className="text-neutral-400 shrink-0 ml-2">
                          {formatBytes(entry.uncompressed_bytes)}
                        </span>
                      </label>
                    );
                  })}
              </div>
              <p className="text-[11px] text-neutral-400">
                Leave unchecked to extract/repack all entries, or select specific files to filter.
              </p>
            </div>
          )}
        </div>

        {/* Right: Context-Aware Format Controls & Action Card */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-red-100 dark:border-red-900/50 p-6 shadow-sm space-y-5">
            <div className="flex items-center space-x-2 border-b border-red-100 dark:border-neutral-700 pb-3">
              <Sliders className="w-4 h-4 text-red-600 dark:text-red-400" />
              <h3 className="font-bold text-neutral-900 dark:text-white text-sm">
                Format-Specific Controls
              </h3>
            </div>

            {isComplexLayoutContext && (
              <div className="space-y-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50">
                <label className="text-xs font-bold text-red-800 dark:text-red-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Fallback & Layout Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('editable')}
                    className={`px-2.5 py-2 rounded-lg text-xs font-semibold border ${
                      layoutMode === 'editable'
                        ? 'bg-red-600 border-red-600 text-white shadow-sm'
                        : 'bg-white border-red-200 text-red-700 dark:bg-neutral-900 dark:border-red-800 dark:text-red-300'
                    }`}
                  >
                    Editable Layout
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('flattened')}
                    className={`px-2.5 py-2 rounded-lg text-xs font-semibold border ${
                      layoutMode === 'flattened'
                        ? 'bg-red-600 border-red-600 text-white shadow-sm'
                        : 'bg-white border-red-200 text-red-700 dark:bg-neutral-900 dark:border-red-800 dark:text-red-300'
                    }`}
                  >
                    Flattened Fidelity
                  </button>
                </div>
              </div>
            )}

            {isMediaContext && (
              <div className="space-y-3 text-xs">
                <div className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-red-600" />
                  Media & GPU Transcode Controls
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Video Codec</label>
                    <select
                      value={videoCodec}
                      onChange={(e) => setVideoCodec(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    >
                      <option value="auto">Auto</option>
                      <option value="h264">H.264 / AVC</option>
                      <option value="h265">H.265 / HEVC</option>
                      <option value="vp9">VP9</option>
                      <option value="av1">AV1</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Audio Codec</label>
                    <select
                      value={audioCodec}
                      onChange={(e) => setAudioCodec(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    >
                      <option value="auto">Auto</option>
                      <option value="aac">AAC</option>
                      <option value="mp3">MP3</option>
                      <option value="opus">Opus</option>
                      <option value="flac">FLAC</option>
                      <option value="pcm">PCM (WAV)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Resolution</label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    >
                      <option value="original">Original</option>
                      <option value="r480p">480p SD</option>
                      <option value="r720p">720p HD</option>
                      <option value="r1080p">1080p Full HD</option>
                      <option value="r4k">4K UHD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">GPU Acceleration</label>
                    <select
                      value={hwAccel}
                      onChange={(e) => setHwAccel(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    >
                      <option value="auto">Auto Detect</option>
                      <option value="nvenc">NVIDIA NVENC</option>
                      <option value="vaapi">VAAPI Hardware</option>
                      <option value="cpu">CPU Software</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Bitrate Mode</label>
                    <select
                      value={bitrateMode}
                      onChange={(e) => setBitrateMode(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    >
                      <option value="vbr">VBR</option>
                      <option value="cbr">CBR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Video kbps</label>
                    <input
                      type="number"
                      min={100}
                      max={50000}
                      placeholder="Auto"
                      value={videoBitrate}
                      onChange={(e) => setVideoBitrate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">FPS</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      placeholder="Auto"
                      value={fps}
                      onChange={(e) => setFps(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Channels</label>
                    <select
                      value={channels}
                      onChange={(e) => setChannels(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    >
                      <option value="original">Original</option>
                      <option value="stereo">Stereo</option>
                      <option value="mono">Mono</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Audio kbps</label>
                    <input
                      type="number"
                      min={16}
                      max={1536}
                      placeholder="Auto"
                      value={audioBitrate}
                      onChange={(e) => setAudioBitrate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Subtitles</label>
                    <select
                      value={subtitleMode}
                      onChange={(e) => setSubtitleMode(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    >
                      <option value="keep">Keep</option>
                      <option value="strip">Strip</option>
                      <option value="extract_srt">Extract SRT</option>
                      <option value="extract_vtt">Extract VTT</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {isArchiveContext && (
              <div className="space-y-3 text-xs">
                <div className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                  <Archive className="w-4 h-4 text-red-600" />
                  Archive & Zip-Bomb Guard Settings
                </div>

                <div>
                  <label className="block text-[11px] text-neutral-500 mb-1">
                    Archive Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={archivePassword}
                    onChange={(e) => setArchivePassword(e.target.value)}
                    placeholder="For encrypted ZIP / 7Z / RAR"
                    className="w-full px-3 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-neutral-500 mb-1">
                    Compression Level
                  </label>
                  <select
                    value={compressionLevel}
                    onChange={(e) => setCompressionLevel(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  >
                    <option value="store">Store (No Compression)</option>
                    <option value="fast">Fast</option>
                    <option value="normal">Normal</option>
                    <option value="maximum">Maximum</option>
                    <option value="ultra">Ultra (Slowest)</option>
                  </select>
                </div>

                {selectedFile && backendOnline && (
                  <button
                    type="button"
                    onClick={handleInspectArchive}
                    disabled={isInspecting}
                    className="w-full py-2 px-3 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-semibold flex items-center justify-center gap-1.5"
                  >
                    {isInspecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>Inspect Entries & Check Safety</span>
                  </button>
                )}
              </div>
            )}

            {!isMediaContext && !isArchiveContext && (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Raster DPI</span>
                  <span className="font-mono text-red-600 font-bold">{dpi} DPI</span>
                </div>
                <input
                  type="range"
                  min={72}
                  max={300}
                  step={12}
                  value={dpi}
                  onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                  className="w-full accent-red-600"
                />
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Quality</span>
                  <span className="font-mono text-red-600 font-bold">{quality}%</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={100}
                  step={5}
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                  className="w-full accent-red-600"
                />
                <label className="flex items-center space-x-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={grayscale}
                    onChange={(e) => setGrayscale(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                    Convert to Grayscale
                  </span>
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={handleConvert}
              disabled={!selectedFile || isConverting || !plan}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-sm shadow-lg shadow-red-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    Convert {sourceExt.toUpperCase()} → {targetExt.toUpperCase()}
                  </span>
                </>
              )}
            </button>

            {isConverting && (
              <p className="text-xs text-center text-red-600 dark:text-red-400 font-semibold">
                {jobStatusText}
              </p>
            )}

            {jobError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{jobError}</span>
              </div>
            )}

            {completedJob && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 space-y-2.5 animate-fade-in">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Converted in {completedJob.elapsedMs}ms ({completedJob.lane})</span>
                </div>
                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 space-y-0.5">
                  <p className="font-semibold text-neutral-900 dark:text-white truncate">
                    {completedJob.filename} ({formatBytes(completedJob.size)})
                  </p>
                  <p className="font-mono truncate" title={completedJob.sha256}>
                    SHA-256: {completedJob.sha256.slice(0, 16)}...
                  </p>
                </div>
                <a
                  href={`${baseUrl}/api/v1/jobs/${completedJob.jobId}/download`}
                  download={completedJob.filename}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Output</span>
                </a>
              </div>
            )}
          </div>

          <div className="bg-red-50/60 dark:bg-neutral-800/50 rounded-2xl border border-red-100 dark:border-red-900/40 p-4 space-y-2 text-[11px] text-neutral-600 dark:text-neutral-400">
            <div className="font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-red-600" />
              Security &amp; Privacy Guarantees
            </div>
            <ul className="space-y-1 list-disc list-inside">
              <li>Automatic file signature &amp; integrity checks</li>
              <li>Archive decompression &amp; size-limit guards</li>
              <li>Isolated per-job temporary workspaces</li>
              <li>Automatic cleanup after download</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Click-to-Open Red & White Formats Sidebar Drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* Slide-over Sidebar Panel */}
          <aside className="relative z-10 w-full max-w-md bg-white dark:bg-neutral-950 h-full shadow-2xl border-r-4 border-red-600 flex flex-col animate-fade-in">
            {/* Sidebar Header */}
            <div className="bg-red-600 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Formats & Compatibility</h3>
                <p className="text-[11px] text-red-100">
                  Pick a source & target format ({sourceExt.toUpperCase()} → {targetExt.toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
                aria-label="Close formats sidebar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-4 border-b border-red-100 dark:border-neutral-800 bg-red-50/40 dark:bg-neutral-900">
              <div className="flex items-center gap-2 bg-white dark:bg-neutral-950 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-red-500 shrink-0" />
                <input
                  type="text"
                  value={formatSearch}
                  onChange={(e) => setFormatSearch(e.target.value)}
                  placeholder="Filter formats (e.g. mp4, pdf, sqlite, dwg)..."
                  className="w-full text-xs bg-transparent focus:outline-none text-neutral-900 dark:text-white"
                />
                {formatSearch && (
                  <button
                    type="button"
                    onClick={() => setFormatSearch('')}
                    className="text-xs text-red-600 font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Sidebar Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Categories */}
              {!searchTerm && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
                    Categories
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORY_LABELS.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          activeCategory === cat.id
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-neutral-900 dark:text-red-300'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Format Selection */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
                  1. Source Format
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {filteredCategoryFormats.map((fmt) => (
                    <button
                      key={fmt.ext}
                      type="button"
                      onClick={() => setSourceExt(fmt.ext)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        sourceExt === fmt.ext
                          ? 'bg-red-600 border-red-600 text-white shadow-sm'
                          : 'bg-white border-red-200 text-neutral-700 hover:border-red-500 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reachable Target Formats */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
                  2. Reachable Output Formats ({filteredReachableTargets.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {filteredReachableTargets.map((fmt) => (
                    <button
                      key={fmt.ext}
                      type="button"
                      onClick={() => {
                        setTargetExt(fmt.ext);
                        setIsSidebarOpen(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        targetExt === fmt.ext
                          ? 'bg-red-600 border-red-600 text-white shadow-sm'
                          : 'bg-red-50/60 border-red-200 text-red-700 hover:bg-red-600 hover:text-white dark:bg-neutral-900 dark:border-red-900 dark:text-red-300'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400">
                  Incompatible targets are automatically disabled. Clicking an output selects it and closes this sidebar.
                </p>
              </div>
            </div>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-red-100 dark:border-neutral-800 bg-white dark:bg-neutral-950">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-sm"
              >
                Done ({sourceExt.toUpperCase()} → {targetExt.toUpperCase()})
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
