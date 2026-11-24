import JSZip from 'jszip';
import { pdfjsLib } from './pdfWorker';
import { ConvertedPageResult, PdfToFormatOptions } from '../types';

/**
 * Parses user input like "1, 3-5, 8" into an array of page numbers
 */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr.trim()) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pagesSet = new Set<number>();
  const parts = rangeStr.split(',').map((p) => p.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => parseInt(s.trim(), 10));
      if (!isNaN(startStr) && !isNaN(endStr)) {
        const start = Math.max(1, Math.min(startStr, endStr));
        const end = Math.min(totalPages, Math.max(startStr, endStr));
        for (let i = start; i <= end; i++) {
          pagesSet.add(i);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= totalPages) {
        pagesSet.add(num);
      }
    }
  }

  const sorted = Array.from(pagesSet).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : Array.from({ length: totalPages }, (_, i) => i + 1);
}

/**
 * Converts a PDF into image pages (PNG, JPEG, WebP)
 */
export async function convertPdfToImages(
  file: File,
  options: PdfToFormatOptions,
  onProgress?: (progress: number, currentPage: number, totalPages: number) => void
): Promise<ConvertedPageResult[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const totalDocPages = pdfDoc.numPages;

  const targetPages = options.pages === 'custom'
    ? parsePageRange(options.customPageRange, totalDocPages)
    : Array.from({ length: totalDocPages }, (_, i) => i + 1);

  const results: ConvertedPageResult[] = [];
  const mimeType = options.format === 'png' ? 'image/png' : options.format === 'webp' ? 'image/webp' : 'image/jpeg';
  const quality = options.format === 'png' ? 1.0 : options.quality;

  for (let index = 0; index < targetPages.length; index++) {
    const pageNum = targetPages[index];
    if (onProgress) {
      onProgress(Math.round(((index + 0.3) / targetPages.length) * 100), index + 1, targetPages.length);
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: options.scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Fill white background for non-transparent formats
    if (options.format !== 'png') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const dataUrl = canvas.toDataURL(mimeType, quality);

    // Create Blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b || new Blob()), mimeType, quality);
    });

    results.push({
      pageNumber: pageNum,
      dataUrl,
      blob,
      width: canvas.width,
      height: canvas.height,
      size: blob.size,
    });

    if (onProgress) {
      onProgress(Math.round(((index + 1) / targetPages.length) * 100), index + 1, targetPages.length);
    }
  }

  return results;
}

/**
 * Extracts all text from a PDF file
 */
export async function extractPdfText(
  file: File,
  onProgress?: (progress: number, currentPage: number, totalPages: number) => void
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  let fullText = '';

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) {
      onProgress(Math.round(((pageNum - 0.5) / numPages) * 100), pageNum, numPages);
    }

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageStrings = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');

    fullText += `--- Page ${pageNum} ---\n\n${pageStrings.trim()}\n\n\n`;

    if (onProgress) {
      onProgress(Math.round((pageNum / numPages) * 100), pageNum, numPages);
    }
  }

  return fullText;
}

/**
 * Creates a ZIP archive containing all converted pages
 */
export async function createZipFromConvertedPages(
  pages: ConvertedPageResult[],
  baseFilename: string,
  extension: string
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(baseFilename) || zip;

  pages.forEach((page) => {
    const filename = `page_${String(page.pageNumber).padStart(3, '0')}.${extension}`;
    folder.file(filename, page.blob);
  });

  return await zip.generateAsync({ type: 'blob' });
}
