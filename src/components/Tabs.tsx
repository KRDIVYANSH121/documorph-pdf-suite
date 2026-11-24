import React from 'react';
import { Image, Minimize2, FileImage, Layers } from 'lucide-react';

export type TabId = 'image-to-pdf' | 'compress-pdf' | 'pdf-to-formats' | 'merge-pdf';

interface TabsProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

export const Tabs: React.FC<TabsProps> = ({ activeTab, onSelectTab }) => {
  const tabItems: { id: TabId; label: string; icon: React.ReactNode; color: string; badge?: string }[] = [
    {
      id: 'image-to-pdf',
      label: 'Images to PDF',
      icon: <Image className="w-4 h-4" />,
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      id: 'compress-pdf',
      label: 'Compress PDF',
      icon: <Minimize2 className="w-4 h-4" />,
      color: 'from-emerald-500 to-emerald-600',
      badge: 'Up to -80%',
    },
    {
      id: 'pdf-to-formats',
      label: 'PDF to Formats / Images',
      icon: <FileImage className="w-4 h-4" />,
      color: 'from-violet-500 to-violet-600',
    },
    {
      id: 'merge-pdf',
      label: 'Merge PDFs',
      icon: <Layers className="w-4 h-4" />,
      color: 'from-amber-500 to-amber-600',
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 bg-slate-200/70 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl max-w-fit mx-auto border border-slate-300/60 dark:border-slate-700/60 shadow-inner">
      {tabItems.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center space-x-2 px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 ${
              isActive
                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-md shadow-black/5 scale-[1.02]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-slate-700/40'
            }`}
          >
            <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
