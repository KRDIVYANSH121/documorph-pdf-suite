import React from 'react';
import { ShieldCheck, Cpu, Zap, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-20 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-12 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 mt-0.5">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                100% Private & In-Browser
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Your images and PDFs are converted entirely inside your browser using WebAssembly. No files are ever sent to an external server.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 mt-0.5">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                Zero Limits & Instant Speed
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                No file size queues, no hourly conversion limits, and no registration or subscription required.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400 mt-0.5">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                Smart Quality Preservation
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Configurable resolution up to 300 DPI, lossless PNG export, intelligent orientation detection, and custom margins.
              </p>
            </div>
          </div>
        </div>

        {/* Copyright & Disclaimer */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 dark:text-slate-500 gap-4">
          <div className="flex items-center space-x-2">
            <span>DocuMorph PDF & Image Suite</span>
            <span>•</span>
            <span>Client-Side Document Processor</span>
          </div>
          <div className="flex items-center space-x-1 text-slate-400 dark:text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Encrypted in memory • Safe for confidential documents</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
