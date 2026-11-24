import * as pdfjsLib from 'pdfjs-dist';

// Point worker to a reliable CDN or bundled worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export { pdfjsLib };
