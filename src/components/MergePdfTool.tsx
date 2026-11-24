import React, { useState } from 'react';
import {
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Loader2,
  Sparkles,
  FileCheck,
  Plus,
} from 'lucide-react';
import { DropZone } from './DropZone';
import { MergePdfItem, getPdfPageCount, mergePdfs } from '../utils/pdfMerge';
import { downloadBlob, formatBytes, triggerConfetti } from '../utils/fileHelpers';

export const MergePdfTool: React.FC = () => {
  const [items, setItems] = useState<MergePdfItem[]>([]);
  const [outputFilename, setOutputFilename] = useState('merged-document.pdf');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; filename: string; totalPages: number } | null>(null);

  const handleFilesSelected = async (files: File[]) => {
    const pdfFiles = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    for (const file of pdfFiles) {
      const pageCount = await getPdfPageCount(file);
      const newItem: MergePdfItem = {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        pageCount,
      };
      setItems((prev) => [...prev, newItem]);
    }

    setResult(null);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;

    const copy = [...items];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setItems(copy);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMerge = async () => {
    if (items.length < 2) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const res = await mergePdfs(items, outputFilename, (prog) => setProgress(prog));
      setResult(res);
      triggerConfetti();
      downloadBlob(res.blob, res.filename);
    } catch (err: any) {
      alert(err.message || 'Error merging PDFs.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Introduction banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-100 dark:border-amber-900/50 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Merge & Combine PDFs
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Combine multiple PDF files into one single document in your desired page order.
          </p>
        </div>
        {items.length > 0 && (
          <span className="text-xs font-semibold px-3 py-1 bg-white dark:bg-slate-800 rounded-full shadow-sm text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-700">
            {items.length} PDF files ready
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <DropZone
          onFilesSelected={handleFilesSelected}
          accept="application/pdf,.pdf"
          multiple={true}
          title="Upload or Drag & Drop Multiple PDFs"
          subtitle="Select 2 or more PDF documents to merge into a single organized file."
          icon={<Layers className="w-8 h-8" />}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* File order list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                Document Sequence ({items.length})
              </h3>
              <p className="text-xs text-slate-400">
                Documents are merged in top-to-bottom sequence
              </p>
            </div>

            <div className="space-y-2.5">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex items-center justify-between gap-4"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'} • {formatBytes(item.size)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
                      title="Move Up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === items.length - 1}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
                      title="Move Down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      title="Remove from list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <DropZone
              onFilesSelected={handleFilesSelected}
              accept="application/pdf,.pdf"
              multiple={true}
              title=""
              subtitle=""
              compact={true}
            />
          </div>

          {/* Merge Settings & Action */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-6">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-700 pb-3">
                Merge Summary
              </h3>

              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>Total Files:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Combined Pages:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {items.reduce((acc, curr) => acc + curr.pageCount, 0)} pages
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Input Size:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {formatBytes(items.reduce((acc, curr) => acc + curr.size, 0))}
                  </span>
                </div>
              </div>

              <div className="space-y-1 pt-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Output Filename
                </label>
                <input
                  type="text"
                  value={outputFilename}
                  onChange={(e) => setOutputFilename(e.target.value)}
                  placeholder="merged-document.pdf"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={handleMerge}
                disabled={isProcessing || items.length < 2}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Merging ({progress}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Merge {items.length} PDFs</span>
                  </>
                )}
              </button>

              {items.length < 2 && (
                <p className="text-[11px] text-amber-600 text-center font-medium">
                  Please add at least 2 PDF files to merge
                </p>
              )}
            </div>

            {/* Success card */}
            {result && !isProcessing && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-3 animate-fade-in">
                <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-300">
                  <FileCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span className="font-bold text-sm">Merged Successfully!</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{result.filename}</p>
                  <p className="mt-0.5">{result.totalPages} total pages combined</p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadBlob(result.blob, result.filename)}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Merged PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
