import React from 'react';
import { FileText, Shield, Moon, Sun } from 'lucide-react';

interface HeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  activeTab: string;
}

export const Header: React.FC<HeaderProps> = ({ darkMode, toggleDarkMode }) => {
  return (
    <header className="sticky top-0 z-40 border-b border-red-100 bg-white/95 backdrop-blur-md dark:border-red-950/60 dark:bg-neutral-950/90 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 via-red-500 to-rose-500 flex items-center justify-center shadow-md shadow-red-500/25 text-white">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-extrabold text-red-600 dark:text-red-400">
                  DocuMorph
                </span>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 rounded-full border border-red-200 dark:border-red-800/60">
                  Omni-Suite
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 hidden sm:block">
                Universal Converter, PDF Compressor & Media Router
              </p>
            </div>
          </div>

          {/* Security badge & theme toggle */}
          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200/80 dark:border-red-800/50 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span>Private &amp; Secure Processing</span>
            </div>

            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
