import { PDFDocument } from 'pdf-lib';

export interface MergePdfItem {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
}

export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch (err) {
    console.error('Error counting PDF pages:', err);
    return 1;
  }
}

export async function mergePdfs(
  items: MergePdfItem[],
  outputFilename: string,
  onProgress?: (progress: number, current: number, total: number) => void
): Promise<{ blob: Blob; filename: string; totalPages: number }> {
  if (items.length < 2) {
    throw new Error('Please select at least 2 PDF files to merge.');
  }

  const mergedPdf = await PDFDocument.create();
  let totalCopiedPages = 0;

  for (let i = 0; i < items.length; i++) {
    if (onProgress) {
      onProgress(Math.round(((i + 0.3) / items.length) * 100), i + 1, items.length);
    }

    const item = items[i];
    const arrayBuffer = await item.file.arrayBuffer();
    const sourcePdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

    copiedPages.forEach((page) => {
      mergedPdf.addPage(page);
      totalCopiedPages++;
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / items.length) * 100), i + 1, items.length);
    }
  }

  const mergedPdfBytes = await mergedPdf.save();
  const blob = new Blob([mergedPdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const safeFilename = outputFilename.trim()
    ? (outputFilename.endsWith('.pdf') ? outputFilename : `${outputFilename}.pdf`)
    : 'merged-document.pdf';

  return {
    blob,
    filename: safeFilename,
    totalPages: totalCopiedPages,
  };
}
