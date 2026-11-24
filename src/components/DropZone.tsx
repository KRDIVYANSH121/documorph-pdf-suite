import React, { useRef, useState } from 'react';
import { UploadCloud, Plus } from 'lucide-react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  compact?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesSelected,
  accept,
  multiple = false,
  title,
  subtitle,
  icon,
  compact = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesSelected(multiple ? droppedFiles : [droppedFiles[0]]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      onFilesSelected(multiple ? selected : [selected[0]]);
      e.target.value = ''; // reset so same files can be re-selected if needed
    }
  };

  if (compact) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
            : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-900/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
        />
        <div className="flex items-center justify-center space-x-2 text-indigo-600 dark:text-indigo-400 font-medium text-sm">
          <Plus className="w-4 h-4" />
          <span>Add more files</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative group border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30 scale-[1.01] shadow-xl shadow-indigo-500/10'
          : 'border-slate-300 dark:border-slate-700/80 hover:border-indigo-500 dark:hover:border-indigo-400 bg-white dark:bg-slate-900/60 shadow-sm hover:shadow-md'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center space-y-4">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-200 ${
            isDragOver
              ? 'bg-indigo-600 text-white'
              : 'bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-inner'
          }`}
        >
          {icon || <UploadCloud className="w-8 h-8" />}
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {title}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {subtitle}
          </p>
        </div>

        <button
          type="button"
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm transition-all shadow-indigo-500/25 group-hover:shadow-indigo-500/40"
        >
          Browse Files
        </button>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Drag & drop files here or click to browse
        </p>
      </div>
    </div>
  );
};
