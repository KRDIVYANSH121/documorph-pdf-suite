import { jsPDF } from 'jspdf';
import { ImageFileItem, ImageToPdfOptions } from '../types';

/**
 * Rotates an image element using an offscreen canvas and returns a data URL
 */
function getRotatedImageDataUrl(
  img: HTMLImageElement,
  rotation: number,
  quality: number
): { dataUrl: string; width: number; height: number } {
  if (rotation === 0) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }

  const canvas = document.createElement('canvas');
  const is90or270 = rotation === 90 || rotation === 270;
  canvas.width = is90or270 ? img.naturalHeight : img.naturalWidth;
  canvas.height = is90or270 ? img.naturalWidth : img.naturalHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Loads an image from a URL into an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

const PAGE_DIMENSIONS_MM: Record<string, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
};

const MARGIN_SIZES_MM: Record<string, number> = {
  none: 0,
  small: 8,
  normal: 16,
};

export async function convertImagesToPdf(
  images: ImageFileItem[],
  options: ImageToPdfOptions,
  onProgress?: (progress: number, current: number, total: number) => void
): Promise<{ blob: Blob; filename: string }> {
  if (!images.length) {
    throw new Error('Please add at least one image to convert.');
  }

  // Pre-load and rotate all images
  const total = images.length;
  let doc: jsPDF | null = null;

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    if (onProgress) {
      onProgress(Math.round(((i + 0.2) / total) * 100), i + 1, total);
    }

    const imgElement = await loadImage(item.previewUrl);
    const { dataUrl, width: imgW, height: imgH } = getRotatedImageDataUrl(
      imgElement,
      item.rotation,
      options.imageQuality
    );

    // Determine orientation
    let isLandscape = false;
    if (options.orientation === 'auto') {
      isLandscape = imgW > imgH;
    } else {
      isLandscape = options.orientation === 'landscape';
    }

    // Determine page dimensions in mm
    let pageWidth: number;
    let pageHeight: number;

    if (options.pageSize === 'fit') {
      // Calculate dimensions in mm based on 96 DPI
      const mmPerPx = 25.4 / 96;
      pageWidth = imgW * mmPerPx;
      pageHeight = imgH * mmPerPx;
    } else {
      const baseDim = PAGE_DIMENSIONS_MM[options.pageSize] || PAGE_DIMENSIONS_MM.a4;
      pageWidth = isLandscape ? Math.max(baseDim.width, baseDim.height) : Math.min(baseDim.width, baseDim.height);
      pageHeight = isLandscape ? Math.min(baseDim.width, baseDim.height) : Math.max(baseDim.width, baseDim.height);
    }

    // Initialize doc or add new page
    if (i === 0) {
      doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: options.pageSize === 'fit' ? [pageWidth, pageHeight] : options.pageSize,
      });
    } else {
      doc!.addPage(
        options.pageSize === 'fit' ? [pageWidth, pageHeight] : options.pageSize,
        isLandscape ? 'landscape' : 'portrait'
      );
    }

    // Calculate margins and printable area
    const margin = MARGIN_SIZES_MM[options.margin] ?? 0;
    const printableWidth = Math.max(10, pageWidth - margin * 2);
    const printableHeight = Math.max(10, pageHeight - margin * 2);

    // Scale image while preserving aspect ratio
    const imgRatio = imgW / imgH;
    let targetW = printableWidth;
    let targetH = targetW / imgRatio;

    if (targetH > printableHeight) {
      targetH = printableHeight;
      targetW = targetH * imgRatio;
    }

    // Center image on the page
    const posX = margin + (printableWidth - targetW) / 2;
    const posY = margin + (printableHeight - targetH) / 2;

    doc!.addImage(dataUrl, 'JPEG', posX, posY, targetW, targetH, undefined, 'FAST');

    // Add optional page numbers
    if (options.addPageNumbers) {
      doc!.setFontSize(9);
      doc!.setTextColor(120, 120, 120);
      const text = `Page ${i + 1} of ${total}`;
      const textWidth = doc!.getStringUnitWidth(text) * 9 * (25.4 / 72);
      doc!.text(text, (pageWidth - textWidth) / 2, pageHeight - Math.max(4, margin / 2));
    }

    if (onProgress) {
      onProgress(Math.round(((i + 1) / total) * 100), i + 1, total);
    }
  }

  const pdfOutput = doc!.output('blob');
  const safeFilename = options.filename.trim() ? (
    options.filename.toLowerCase().endsWith('.pdf') ? options.filename : `${options.filename}.pdf`
  ) : 'converted-images.pdf';

  return {
    blob: pdfOutput,
    filename: safeFilename,
  };
}
