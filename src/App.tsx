import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Tabs, TabId } from './components/Tabs';
import { ImageToPdfTool } from './components/ImageToPdfTool';
import { CompressPdfTool } from './components/CompressPdfTool';
import { PdfToFormatsTool } from './components/PdfToFormatsTool';
import { MergePdfTool } from './components/MergePdfTool';
import { Footer } from './components/Footer';
import { ShieldCheck, Sparkles, Zap, Lock, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('image-to-pdf');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} activeTab={activeTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fast, Secure & 100% Free PDF Suite</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Convert, Compress & Transform{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
              PDFs Instantly
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Convert uploaded photos into professional PDFs, shrink PDF file size by up to 80%, or extract pages into crisp PNG, JPG, WebP images and text.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div>
          <Tabs activeTab={activeTab} onSelectTab={setActiveTab} />
        </div>

        {/* Active Tool View */}
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-10 shadow-xl shadow-slate-200/40 dark:shadow-none">
          {activeTab === 'image-to-pdf' && <ImageToPdfTool />}
          {activeTab === 'compress-pdf' && <CompressPdfTool />}
          {activeTab === 'pdf-to-formats' && <PdfToFormatsTool />}
          {activeTab === 'merge-pdf' && <MergePdfTool />}
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Zero Server Uploads</span>
            <span className="text-[11px] text-slate-500">Processed locally in browser</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">High-Speed Engine</span>
            <span className="text-[11px] text-slate-500">Multithreaded canvas & WebAssembly</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <RefreshCw className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Multiple Formats</span>
            <span className="text-[11px] text-slate-500">JPG, PNG, WebP, PDF & TXT</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">No Watermarks</span>
            <span className="text-[11px] text-slate-500">Clean and 100% free forever</span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
export default App;
