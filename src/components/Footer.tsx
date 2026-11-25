import React from 'react';
import { ShieldCheck, Cpu, Zap, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-20 border-t border-red-100 dark:border-red-950/60 bg-white dark:bg-neutral-950 py-12 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-red-100 dark:border-red-950/60">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 mt-0.5">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                Private &amp; Secure Processing
              </h4>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Strict file-signature verification, archive decompression protection, and isolated per-job workspaces.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 mt-0.5">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                Smart Multi-Step Routing
              </h4>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Automatically bridges complex formats across documents, spreadsheets, media, eBooks, and archives.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 mt-0.5">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                Fast Priority Queues
              </h4>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Separates lightweight document and image conversions from heavy video and CAD workloads so tasks stay responsive.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-400 dark:text-neutral-500 gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-red-600 dark:text-red-400">DocuMorph</span>
            <span>•</span>
            <span>Universal File &amp; PDF Suite</span>
          </div>
          <div className="flex items-center space-x-1">
            <ShieldCheck className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span>Safe for confidential documents</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
