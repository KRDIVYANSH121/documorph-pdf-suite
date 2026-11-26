import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Tabs, TabId } from './components/Tabs';
import { ImageToPdfTool } from './components/ImageToPdfTool';
import { CompressPdfTool } from './components/CompressPdfTool';
import { PdfToFormatsTool } from './components/PdfToFormatsTool';
import { MergePdfTool } from './components/MergePdfTool';
import { OmniConverterTool } from './components/OmniConverterTool';
import { Footer } from './components/Footer';
import { ShieldCheck, Sparkles, Zap, Lock, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('omni-converter');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
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

  // Harden desktop UI against casual right-click / DevTools shortcuts without breaking mobile touch or inputs
  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    const blockContext = (e: MouseEvent) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    const blockInspectKeys = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const key = e.key.toUpperCase();
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && key === 'U')
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', blockContext);
    document.addEventListener('keydown', blockInspectKeys);
    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown', blockInspectKeys);
    };
  }, []);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors duration-200 overflow-x-hidden">
      <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} activeTab={activeTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fast, Secure &amp; Universal File Converter</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            Convert, Compress &amp; Transform{' '}
            <span className="text-red-600 dark:text-red-400">
              Any File Format
            </span>
          </h1>

          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Convert 90+ formats across documents, spreadsheets, media, eBooks, archives, and 3D/CAD — fast, private, and reliable.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div>
          <Tabs activeTab={activeTab} onSelectTab={setActiveTab} />
        </div>

        {/* Active Tool View */}
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-red-100 dark:border-red-900/50 p-6 sm:p-10 shadow-xl shadow-red-500/5 dark:shadow-none">
          {activeTab === 'omni-converter' && <OmniConverterTool />}
          {activeTab === 'image-to-pdf' && <ImageToPdfTool />}
          {activeTab === 'compress-pdf' && <CompressPdfTool />}
          {activeTab === 'pdf-to-formats' && <PdfToFormatsTool />}
          {activeTab === 'merge-pdf' && <MergePdfTool />}
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-red-100 dark:border-red-900/40 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">Hardened Security</span>
            <span className="text-[11px] text-neutral-500">Magic-byte & Zip-Bomb guards</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-red-100 dark:border-red-900/40 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">Smart Routing</span>
            <span className="text-[11px] text-neutral-500">Fast &amp; heavy workload queues</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-red-100 dark:border-red-900/40 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <RefreshCw className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">90+ File Formats</span>
            <span className="text-[11px] text-neutral-500">Docs, Media, Archives &amp; CAD</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-red-100 dark:border-red-900/40 shadow-sm flex flex-col items-center text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">Private Processing</span>
            <span className="text-[11px] text-neutral-500">Isolated ephemeral workspaces</span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
export default App;
