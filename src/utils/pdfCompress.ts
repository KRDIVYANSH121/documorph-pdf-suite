import { jsPDF } from 'jspdf';
import { pdfjsLib } from './pdfWorker';
import { CompressionOptions } from '../types';

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  savingsPercentage: number;
  filename: string;
  pageCount: number;
}

export async function compressPdf(
  file: File,
  options: CompressionOptions,
  onProgress?: (progress: number, currentPage: number, totalPages: number) => void
): Promise<CompressionResult> {
  const originalSize = file.size;
  const arrayBuffer = await file.arrayBuffer();

  // Load document with PDF.js
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  if (numPages === 0) {
    throw new Error('The uploaded PDF has no pages.');
  }

  // Determine DPI and JPEG Quality
  let targetDpi = options.dpi;
  let targetQuality = options.quality;

  if (options.level === 'extreme') {
    targetDpi = 85;
    targetQuality = 0.45;
  } else if (options.level === 'recommended') {
    targetDpi = 130;
    targetQuality = 0.65;
  } else if (options.level === 'light') {
    targetDpi = 180;
    targetQuality = 0.82;
  }

  // Scale relative to default 72 DPI PDF coordinates
  const scale = targetDpi / 72;

  let newDoc: jsPDF | null = null;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) {
      onProgress(Math.round(((pageNum - 0.5) / numPages) * 100), pageNum, numPages);
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Render page to canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Fill white background before rendering
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    // Optional Grayscale transform
    if (options.grayscale) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Luminance formula
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const jpegDataUrl = canvas.toDataURL('image/jpeg', targetQuality);

    // Compute original page dimensions in mm (72 pt per inch = 25.4 / 72 mm per pt)
    const originalViewport = page.getViewport({ scale: 1.0 });
    const ptToMm = 25.4 / 72;
    const pageWMm = originalViewport.width * ptToMm;
    const pageHMm = originalViewport.height * ptToMm;
    const isLandscape = pageWMm > pageHMm;

    if (pageNum === 1) {
      newDoc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pageWMm, pageHMm],
      });
    } else {
      newDoc!.addPage([pageWMm, pageHMm], isLandscape ? 'landscape' : 'portrait');
    }

    newDoc!.addImage(jpegDataUrl, 'JPEG', 0, 0, pageWMm, pageHMm, undefined, 'FAST');

    if (onProgress) {
      onProgress(Math.round((pageNum / numPages) * 100), pageNum, numPages);
    }
  }

  const compressedBlob = newDoc!.output('blob');
  const compressedSize = compressedBlob.size;
  const savings = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100));

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const outFilename = options.filename?.trim()
    ? (options.filename.endsWith('.pdf') ? options.filename : `${options.filename}.pdf`)
    : `${baseName}-compressed.pdf`;

  return {
    blob: compressedBlob,
    originalSize,
    compressedSize,
    savingsPercentage: savings,
    filename: outFilename,
    pageCount: numPages,
  };
}
