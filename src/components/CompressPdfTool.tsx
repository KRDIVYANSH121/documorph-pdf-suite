import React, { useState } from 'react';
import {
  Minimize2,
  FileText,
  Download,
  Sliders,
  CheckCircle2,
  Loader2,
  TrendingDown,
  Sparkles,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { DropZone } from './DropZone';
import { CompressionLevel, CompressionOptions } from '../types';
import { compressPdf, CompressionResult } from '../utils/pdfCompress';
import { downloadBlob, formatBytes, triggerConfetti } from '../utils/fileHelpers';

export const CompressPdfTool: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [options, setOptions] = useState<CompressionOptions>({
    level: 'recommended',
    dpi: 130,
    quality: 0.65,
    grayscale: false,
    filename: '',
  });

  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [result, setResult] = useState<CompressionResult | null>(null);

  const handleFileSelected = (files: File[]) => {
    if (files.length > 0 && files[0].type === 'application/pdf') {
      setSelectedFile(files[0]);
      setResult(null);
    } else if (files.length > 0 && files[0].name.toLowerCase().endsWith('.pdf')) {
      setSelectedFile(files[0]);
      setResult(null);
    }
  };

  const handleCompress = async () => {
    if (!selectedFile) return;

    setIsCompressing(true);
    setProgress(0);
    setProgressStatus('Reading PDF document structure...');

    try {
      const res = await compressPdf(selectedFile, options, (prog, current, total) => {
        setProgress(prog);
        setProgressStatus(`Compressing page ${current} of ${total}...`);
      });

      setResult(res);
      triggerConfetti();
      downloadBlob(res.blob, res.filename);
    } catch (err: any) {
      alert(err.message || 'Error compressing PDF.');
    } finally {
      setIsCompressing(false);
    }
  };

  const resetAll = () => {
    setSelectedFile(null);
    setResult(null);
    setProgress(0);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Introduction banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Minimize2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Compress PDF
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Significantly reduce PDF file size while retaining crystal clear text and image readability.
          </p>
        </div>
        {selectedFile && (
          <button
            onClick={resetAll}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Select Another PDF</span>
          </button>
        )}
      </div>

      {!selectedFile ? (
        <DropZone
          onFilesSelected={handleFileSelected}
          accept="application/pdf,.pdf"
          multiple={false}
          title="Upload or Drag & Drop PDF to Compress"
          subtitle="Processed 100% locally on your machine. Large files welcome."
          icon={<Minimize2 className="w-8 h-8" />}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* File Card & Before/After Comparison */}
          <div className="lg:col-span-2 space-y-6">
            {/* File info banner */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 flex items-center justify-center font-bold">
                  PDF
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate max-w-sm sm:max-w-md">
                    {selectedFile.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Original Size: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatBytes(selectedFile.size)}</span>
                  </p>
                </div>
              </div>

              <span className="hidden sm:inline-block px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full">
                Ready to compress
              </span>
            </div>

            {/* If compressed: Show interactive Before vs After Comparison */}
            {result && (
              <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-white dark:from-emerald-950/30 dark:via-slate-800 dark:to-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 p-6 sm:p-8 shadow-sm space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-bold text-lg">Compression Successful!</h3>
                  </div>
                  <div className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-600/25">
                    <TrendingDown className="w-4 h-4" />
                    <span>-{result.savingsPercentage}% Smaller</span>
                  </div>
                </div>

                {/* Size stats comparison */}
                <div className="grid grid-cols-2 gap-4 sm:gap-6 bg-white dark:bg-slate-800/80 rounded-xl p-5 border border-slate-100 dark:border-slate-700/60">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Before</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-600 dark:text-slate-400 line-through">
                      {formatBytes(result.originalSize)}
                    </p>
                    <p className="text-[11px] text-slate-400">Original Document</p>
                  </div>

                  <div className="space-y-1 border-l border-slate-100 dark:border-slate-700 pl-4 sm:pl-6">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">After</p>
                    <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                      {formatBytes(result.compressedSize)}
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Reduced by {formatBytes(result.originalSize - result.compressedSize)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="button"
                    onClick={() => downloadBlob(result.blob, result.filename)}
                    className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/25 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Compressed PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="w-full sm:w-auto py-3 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Compress Another
                  </button>
                </div>
              </div>
            )}

            {/* Presets Description Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  id: 'recommended',
                  title: 'Recommended',
                  tag: 'Most Popular',
                  desc: 'Great balance of small size and high visual clarity.',
                  dpi: '130 DPI',
                },
                {
                  id: 'extreme',
                  title: 'Extreme Size Saver',
                  tag: 'Maximum Savings',
                  desc: 'Ideal for email attachments with strict file limits.',
                  dpi: '85 DPI',
                },
                {
                  id: 'light',
                  title: 'Light Compression',
                  tag: 'High Fidelity',
                  desc: 'Preserves sharpest text and high-res photography.',
                  dpi: '180 DPI',
                },
              ].map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => setOptions({ ...options, level: preset.id as CompressionLevel })}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    options.level === preset.id
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-100">{preset.title}</span>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                      {preset.dpi}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{preset.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Controls & Configuration Sidebar */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Compression Settings
                </h3>
              </div>

              {/* Compression Preset Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Preset Level
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'recommended', label: 'Recommended' },
                    { id: 'extreme', label: 'Extreme' },
                    { id: 'light', label: 'Light' },
                    { id: 'custom', label: 'Custom ⚙️' },
                  ].map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setOptions({ ...options, level: lvl.id as CompressionLevel })}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                        options.level === lvl.id
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-300 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Sliders (if custom selected) */}
              {options.level === 'custom' && (
                <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-700">
                  {/* DPI Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-300">Target Resolution</span>
                      <span className="font-mono text-emerald-600 font-semibold">{options.dpi} DPI</span>
                    </div>
                    <input
                      type="range"
                      min="72"
                      max="220"
                      step="5"
                      value={options.dpi}
                      onChange={(e) => setOptions({ ...options, dpi: parseInt(e.target.value, 10) })}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>

                  {/* JPEG Quality Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-300">Image Quality</span>
                      <span className="font-mono text-emerald-600 font-semibold">{Math.round(options.quality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="0.95"
                      step="0.05"
                      value={options.quality}
                      onChange={(e) => setOptions({ ...options, quality: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>
                </div>
              )}

              {/* Convert to Grayscale toggle */}
              <label className="flex items-center space-x-3 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={options.grayscale}
                  onChange={(e) => setOptions({ ...options, grayscale: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
                    Grayscale Mode
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    Massive size reduction for scanned docs, contracts & text
                  </span>
                </div>
              </label>

              {/* Output filename */}
              <div className="space-y-1 pt-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Custom Output Name (Optional)
                </label>
                <input
                  type="text"
                  value={options.filename}
                  onChange={(e) => setOptions({ ...options, filename: e.target.value })}
                  placeholder={`${selectedFile.name.replace(/\.[^/.]+$/, '')}-compressed.pdf`}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Compress Action Button */}
              <button
                type="button"
                onClick={handleCompress}
                disabled={isCompressing}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isCompressing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Compressing ({progress}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Compress PDF Now</span>
                  </>
                )}
              </button>

              {/* Progress bar */}
              {isCompressing && (
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
                    {progressStatus}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
