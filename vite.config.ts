import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  esbuild: {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'pdf-lib', 'jspdf', 'jszip']
  }
});
