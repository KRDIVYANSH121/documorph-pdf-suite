import React, { useState } from 'react';
import {
  Image as ImageIcon,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  Settings2,
  FileCheck,
  Loader2,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import { DropZone } from './DropZone';
import { ImageFileItem, ImageToPdfOptions, PageMargin, PageOrientation, PageSize } from '../types';
import { convertImagesToPdf } from '../utils/imageToPdf';
import { downloadBlob, formatBytes, triggerConfetti } from '../utils/fileHelpers';

export const ImageToPdfTool: React.FC = () => {
  const [images, setImages] = useState<ImageFileItem[]>([]);
  const [options, setOptions] = useState<ImageToPdfOptions>({
    pageSize: 'a4',
    orientation: 'auto',
    margin: 'small',
    imageQuality: 0.85,
    addPageNumbers: false,
    filename: 'converted-document.pdf',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [result, setResult] = useState<{ blob: Blob; filename: string; size: number } | null>(null);

  const handleFilesSelected = (files: File[]) => {
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'];

    files.forEach((file) => {
      if (!validImageTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i)) {
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const newItem: ImageFileItem = {
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          name: file.name,
          size: file.size,
          previewUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          rotation: 0,
        };
        setImages((prev) => [...prev, newItem]);
      };
      img.src = previewUrl;
    });

    setResult(null);
  };

  const handleRotate = (id: string) => {
    setImages((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    );
  };

  const handleRemove = (id: string) => {
    setImages((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      const toRemove = prev.find((item) => item.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.previewUrl);
      return filtered;
    });
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const newArr = [...images];
    const [moved] = newArr.splice(index, 1);
    newArr.splice(targetIndex, 0, moved);
    setImages(newArr);
  };

  const handleClearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setResult(null);
  };

  const handleConvert = async () => {
    if (!images.length) return;
    setIsProcessing(true);
    setProgress(0);
    setProgressStatus('Initializing conversion...');

    try {
      const res = await convertImagesToPdf(images, options, (prog, current, total) => {
        setProgress(prog);
        setProgressStatus(`Processing image ${current} of ${total}...`);
      });

      setResult({
        blob: res.blob,
        filename: res.filename,
        size: res.blob.size,
      });

      triggerConfetti();
      downloadBlob(res.blob, res.filename);
    } catch (err: any) {
      alert(err.message || 'Error converting images to PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Introduction banner */}
      <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Convert Images to PDF
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Turn JPG, PNG, WebP, GIF, or BMP images into clean, customized, printable PDF documents.
          </p>
        </div>
        {images.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 bg-white dark:bg-slate-800 rounded-full shadow-sm text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700">
              {images.length} {images.length === 1 ? 'image' : 'images'} added
            </span>
            <button
              onClick={handleClearAll}
              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {images.length === 0 ? (
        <DropZone
          onFilesSelected={handleFilesSelected}
          accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif"
          multiple={true}
          title="Upload or Drag & Drop Images"
          subtitle="Supports multiple JPG, PNG, WebP, GIF, and BMP files. No limit on quantity."
          icon={<ImageIcon className="w-8 h-8" />}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Images Grid (2 cols on desktop) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                Rearrange & Edit Pages ({images.length})
              </h3>
              <p className="text-xs text-slate-400">
                Use arrows to reorder pages • Click rotate to flip
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {images.map((item, index) => (
                <div
                  key={item.id}
                  className="group relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
                >
                  {/* Page number badge */}
                  <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                    Page {index + 1}
                  </div>

                  {/* Image container with rotation */}
                  <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-2 overflow-hidden">
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                      className="max-h-full max-w-full object-contain transition-transform duration-200 rounded"
                    />
                  </div>

                  {/* Details & Controls */}
                  <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700/60 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate" title={item.name}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {item.width} × {item.height} • {formatBytes(item.size)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleMove(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                          title="Move Left/Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5 rotate-[-90deg] sm:rotate-0" />
                        </button>
                        <button
                          onClick={() => handleMove(index, 'down')}
                          disabled={index === images.length - 1}
                          className="p-1 rounded text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                          title="Move Right/Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5 rotate-[-90deg] sm:rotate-0" />
                        </button>
                        <button
                          onClick={() => handleRotate(item.id)}
                          className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                          title="Rotate 90°"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleRemove(item.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Remove image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DropZone
              onFilesSelected={handleFilesSelected}
              accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif"
              multiple={true}
              title=""
              subtitle=""
              compact={true}
            />
          </div>

          {/* Settings and Action Sidebar (1 col) */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                <Settings2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Document Settings
                </h3>
              </div>

              {/* Page Size */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Page Size
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'a4', label: 'A4 (210×297mm)' },
                    { id: 'letter', label: 'US Letter' },
                    { id: 'legal', label: 'Legal' },
                    { id: 'fit', label: 'Fit to Image' },
                  ].map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setOptions({ ...options, pageSize: size.id as PageSize })}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                        options.pageSize === size.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-500 dark:text-indigo-300 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Orientation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'auto', label: 'Auto (Best)' },
                    { id: 'portrait', label: 'Portrait' },
                    { id: 'landscape', label: 'Landscape' },
                  ].map((ori) => (
                    <button
                      key={ori.id}
                      type="button"
                      onClick={() => setOptions({ ...options, orientation: ori.id as PageOrientation })}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                        options.orientation === ori.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-500 dark:text-indigo-300 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {ori.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Page Margins
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'none', label: 'No Margin' },
                    { id: 'small', label: 'Small (8mm)' },
                    { id: 'normal', label: 'Normal (16mm)' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setOptions({ ...options, margin: m.id as PageMargin })}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition-all ${
                        options.margin === m.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-500 dark:text-indigo-300 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Quality Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Image Quality</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono font-medium">
                    {Math.round(options.imageQuality * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.0"
                  step="0.05"
                  value={options.imageQuality}
                  onChange={(e) => setOptions({ ...options, imageQuality: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Add Page Numbers toggle */}
              <label className="flex items-center space-x-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={options.addPageNumbers}
                  onChange={(e) => setOptions({ ...options, addPageNumbers: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Add Page Numbers in footer
                </span>
              </label>

              {/* Custom Filename */}
              <div className="space-y-1 pt-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Output Filename
                </label>
                <input
                  type="text"
                  value={options.filename}
                  onChange={(e) => setOptions({ ...options, filename: e.target.value })}
                  placeholder="converted-document.pdf"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Convert Action Button */}
              <button
                type="button"
                onClick={handleConvert}
                disabled={isProcessing || images.length === 0}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Converting ({progress}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Convert {images.length} {images.length === 1 ? 'Image' : 'Images'} to PDF</span>
                  </>
                )}
              </button>

              {/* Processing Progress bar */}
              {isProcessing && (
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
                    {progressStatus}
                  </p>
                </div>
              )}
            </div>

            {/* Result Download Card */}
            {result && !isProcessing && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 space-y-3 animate-fade-in">
                <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300">
                  <FileCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold text-sm">PDF Ready for Download!</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{result.filename}</p>
                  <p className="mt-0.5">Size: {formatBytes(result.size)} • {images.length} pages</p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadBlob(result.blob, result.filename)}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all shadow-emerald-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF Again</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
