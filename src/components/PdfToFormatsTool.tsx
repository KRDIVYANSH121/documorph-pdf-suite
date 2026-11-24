import React, { useState } from 'react';
import {
  FileImage,
  Download,
  Copy,
  Check,
  Archive,
  Loader2,
  Sparkles,
  FileText,
  Eye,
  RefreshCw,
  Sliders,
  ZoomIn,
} from 'lucide-react';
import { DropZone } from './DropZone';
import { ConvertedPageResult, ExportFormat, PdfToFormatOptions } from '../types';
import { convertPdfToImages, extractPdfText, createZipFromConvertedPages } from '../utils/pdfConverter';
import { downloadBlob, formatBytes, triggerConfetti } from '../utils/fileHelpers';

export const PdfToFormatsTool: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [options, setOptions] = useState<PdfToFormatOptions>({
    format: 'png',
    scale: 2,
    quality: 0.9,
    pages: 'all',
    customPageRange: '',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');

  // Results
  const [convertedPages, setConvertedPages] = useState<ConvertedPageResult[]>([]);
  const [extractedText, setExtractedText] = useState<string>('');
  const [copiedText, setCopiedText] = useState(false);
  const [activePreviewImage, setActivePreviewImage] = useState<ConvertedPageResult | null>(null);

  const handleFileSelected = (files: File[]) => {
    if (files.length > 0) {
      setSelectedFile(files[0]);
      setConvertedPages([]);
      setExtractedText('');
    }
  };

  const handleConvert = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setProgress(0);
    setProgressStatus('Initializing converter engine...');
    setConvertedPages([]);
    setExtractedText('');

    try {
      if (options.format === 'txt') {
        const text = await extractPdfText(selectedFile, (prog, current, total) => {
          setProgress(prog);
          setProgressStatus(`Extracting text from page ${current} of ${total}...`);
        });
        setExtractedText(text);
        triggerConfetti();
      } else {
        const pages = await convertPdfToImages(selectedFile, options, (prog, current, total) => {
          setProgress(prog);
          setProgressStatus(`Rendering page ${current} of ${total}...`);
        });
        setConvertedPages(pages);
        triggerConfetti();
      }
    } catch (err: any) {
      alert(err.message || 'Error converting PDF document.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!convertedPages.length || !selectedFile) return;
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
    const zipBlob = await createZipFromConvertedPages(convertedPages, baseName, options.format);
    downloadBlob(zipBlob, `${baseName}-${options.format}-pages.zip`);
  };

  const handleDownloadSinglePage = (page: ConvertedPageResult) => {
    if (!selectedFile) return;
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
    downloadBlob(page.blob, `${baseName}-page-${page.pageNumber}.${options.format}`);
  };

  const handleDownloadText = () => {
    if (!extractedText || !selectedFile) return;
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${baseName}-extracted.txt`);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(extractedText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const resetAll = () => {
    setSelectedFile(null);
    setConvertedPages([]);
    setExtractedText('');
    setProgress(0);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Introduction banner */}
      <div className="bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-indigo-500/10 border border-violet-100 dark:border-violet-900/50 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileImage className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            Convert PDF to Images & Formats
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Turn PDF pages into crystal-clear PNG, JPG, WebP images or extract entire plain text content.
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
          title="Upload or Drag & Drop PDF to Convert"
          subtitle="Supports single or multi-page documents. 100% private in-browser conversion."
          icon={<FileImage className="w-8 h-8" />}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main workspace: Results or Document details */}
          <div className="lg:col-span-2 space-y-6">
            {/* File info card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400 flex items-center justify-center font-bold">
                  PDF
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate max-w-sm sm:max-w-md">
                    {selectedFile.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {formatBytes(selectedFile.size)} • Target: <span className="uppercase font-semibold text-violet-600 dark:text-violet-400">{options.format}</span>
                  </p>
                </div>
              </div>

              {convertedPages.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-violet-600/20"
                >
                  <Archive className="w-4 h-4" />
                  <span>Download All as ZIP</span>
                </button>
              )}
            </div>

            {/* Extracted Text Result */}
            {extractedText && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                      Extracted Text Content
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopyText}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-1"
                    >
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedText ? 'Copied!' : 'Copy Text'}</span>
                    </button>
                    <button
                      onClick={handleDownloadText}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium flex items-center space-x-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .txt</span>
                    </button>
                  </div>
                </div>

                <textarea
                  readOnly
                  value={extractedText}
                  rows={14}
                  className="w-full font-mono text-xs p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            )}

            {/* Converted Image Pages Gallery */}
            {convertedPages.length > 0 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    Converted Pages ({convertedPages.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Click any page to enlarge • Click download to save individually
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {convertedPages.map((page) => (
                    <div
                      key={page.pageNumber}
                      className="group relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
                    >
                      {/* Badge */}
                      <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                        Page {page.pageNumber}
                      </div>

                      {/* Thumbnail with overlay view button */}
                      <div
                        onClick={() => setActivePreviewImage(page)}
                        className="aspect-[3/4] bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-2 overflow-hidden cursor-pointer relative"
                      >
                        <img
                          src={page.dataUrl}
                          alt={`Page ${page.pageNumber}`}
                          className="max-h-full max-w-full object-contain shadow-sm rounded group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <span className="p-2 rounded-full bg-white/90 text-slate-800 shadow-md">
                            <ZoomIn className="w-5 h-5" />
                          </span>
                        </div>
                      </div>

                      {/* Info & Download */}
                      <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {page.width} × {page.height}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatBytes(page.size)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadSinglePage(page)}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-violet-50 dark:hover:bg-violet-950/50 hover:text-violet-600 text-slate-600 dark:text-slate-300 transition-colors"
                          title="Download this page"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Options & Action Sidebar */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                <Sliders className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Output Format & Quality
                </h3>
              </div>

              {/* Target Format */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Target Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'png', label: 'PNG (Lossless)' },
                    { id: 'jpeg', label: 'JPEG (Compact)' },
                    { id: 'webp', label: 'WebP (Modern)' },
                    { id: 'txt', label: 'Text (.txt)' },
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setOptions({ ...options, format: fmt.id as ExportFormat })}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                        options.format === fmt.id
                          ? 'border-violet-600 bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:border-violet-500 dark:text-violet-300 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution / Scale (for image formats) */}
              {options.format !== 'txt' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Image Resolution / Scale
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { scale: 1, label: '1x (72-96 DPI)' },
                      { scale: 2, label: '2x (150-200 DPI)' },
                      { scale: 3, label: '3x (300 DPI)' },
                    ].map((s) => (
                      <button
                        key={s.scale}
                        type="button"
                        onClick={() => setOptions({ ...options, scale: s.scale })}
                        className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                          options.scale === s.scale
                            ? 'border-violet-600 bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:border-violet-500 dark:text-violet-300 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Page Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Page Selection
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, pages: 'all' })}
                    className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                      options.pages === 'all'
                        ? 'border-violet-600 bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:border-violet-500 dark:text-violet-300 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    All Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, pages: 'custom' })}
                    className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                      options.pages === 'custom'
                        ? 'border-violet-600 bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:border-violet-500 dark:text-violet-300 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>

                {options.pages === 'custom' && (
                  <input
                    type="text"
                    value={options.customPageRange}
                    onChange={(e) => setOptions({ ...options, customPageRange: e.target.value })}
                    placeholder="e.g. 1-3, 5, 8"
                    className="w-full text-xs px-3 py-2 mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                )}
              </div>

              {/* Convert Action Button */}
              <button
                type="button"
                onClick={handleConvert}
                disabled={isProcessing}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Converting ({progress}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Convert to {options.format.toUpperCase()}</span>
                  </>
                )}
              </button>

              {/* Progress bar */}
              {isProcessing && (
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-violet-600 h-2 rounded-full transition-all duration-200"
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

      {/* Enlarged Image Preview Modal */}
      {activePreviewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActivePreviewImage(null)}
        >
          <div
            className="max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                Page {activePreviewImage.pageNumber} Preview ({activePreviewImage.width} × {activePreviewImage.height})
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadSinglePage(activePreviewImage)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setActivePreviewImage(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto max-h-[75vh] flex items-center justify-center bg-slate-100 dark:bg-slate-950">
              <img
                src={activePreviewImage.dataUrl}
                alt={`Page ${activePreviewImage.pageNumber}`}
                className="max-h-full max-w-full object-contain rounded shadow"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
