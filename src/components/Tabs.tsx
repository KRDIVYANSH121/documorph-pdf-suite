import React from 'react';
import { Image, Minimize2, FileImage, Layers, Cpu } from 'lucide-react';

export type TabId = 'omni-converter' | 'image-to-pdf' | 'compress-pdf' | 'pdf-to-formats' | 'merge-pdf';

interface TabsProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

export const Tabs: React.FC<TabsProps> = ({ activeTab, onSelectTab }) => {
  const tabItems: { id: TabId; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'omni-converter',
      label: 'Omni-Converter',
      icon: <Cpu className="w-4 h-4" />,
      badge: '90+ Formats',
    },
    {
      id: 'image-to-pdf',
      label: 'Images to PDF',
      icon: <Image className="w-4 h-4" />,
    },
    {
      id: 'compress-pdf',
      label: 'Compress PDF',
      icon: <Minimize2 className="w-4 h-4" />,
      badge: 'Up to -80%',
    },
    {
      id: 'pdf-to-formats',
      label: 'PDF to Formats / Images',
      icon: <FileImage className="w-4 h-4" />,
    },
    {
      id: 'merge-pdf',
      label: 'Merge PDFs',
      icon: <Layers className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 bg-red-50/90 dark:bg-neutral-900 rounded-2xl max-w-fit mx-auto border border-red-200/80 dark:border-red-900/50 shadow-sm">
      {tabItems.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center space-x-2 px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 ${
              isActive
                ? 'bg-red-600 text-white shadow-md shadow-red-600/25 scale-[1.02]'
                : 'text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-white hover:bg-white dark:hover:bg-red-950/40'
            }`}
          >
            <span className={isActive ? 'text-white' : 'text-red-600 dark:text-red-400'}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {tab.badge && (
              <span
                className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-red-600 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
