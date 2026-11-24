export interface ImageFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
}

export type PageSize = 'a4' | 'letter' | 'legal' | 'fit';
export type PageOrientation = 'portrait' | 'landscape' | 'auto';
export type PageMargin = 'none' | 'small' | 'normal';

export interface ImageToPdfOptions {
  pageSize: PageSize;
  orientation: PageOrientation;
  margin: PageMargin;
  imageQuality: number; // 0.1 to 1.0
  addPageNumbers: boolean;
  filename: string;
}

export type CompressionLevel = 'extreme' | 'recommended' | 'light' | 'custom';

export interface CompressionOptions {
  level: CompressionLevel;
  dpi: number;
  quality: number; // 0.1 to 1.0
  grayscale: boolean;
  filename: string;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'txt';

export interface PdfToFormatOptions {
  format: ExportFormat;
  scale: number; // 1, 1.5, 2, 3
  quality: number; // for jpeg/webp
  pages: 'all' | 'custom';
  customPageRange: string;
}

export interface ConvertedPageResult {
  pageNumber: number;
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  size: number;
}
