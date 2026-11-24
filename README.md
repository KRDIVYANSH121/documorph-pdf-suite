# DocuMorph - PDF & Image Processing Suite

A modern, high-performance, 100% client-side web application for converting images to PDF, compressing PDF documents, and converting PDFs into different formats (PNG, JPG, WebP, TXT) and merging documents.

## Key Features

1. **Images to PDF Converter**:
   - Convert multiple JPG, PNG, WebP, GIF, or BMP images into customized PDF files.
   - Rearrange page order, rotate individual images 90°, delete pages.
   - Customize page size (A4, US Letter, Legal, Fit to Image aspect ratio).
   - Smart Auto-Orientation (Portrait or Landscape based on image shape).
   - Margins control (None, Small 8mm, Normal 16mm).
   - Image quality compression slider and page numbering support.

2. **PDF Compressor**:
   - Compress heavy PDFs right in the browser.
   - Presets: Recommended (130 DPI), Extreme (85 DPI for strict email limits), Light (180 DPI).
   - Custom Controls: DPI slider, JPEG quality slider, and Grayscale conversion mode (massive savings for scanned docs and receipts).
   - Before & After file size stats with savings percentage (-70%+).

3. **PDF to Different Formats**:
   - Convert PDF pages into crystal-clear images (PNG, JPEG, WebP) or extract plain text (TXT).
   - Multi-resolution scaling: 1x (72-96 DPI), 2x (150-200 DPI), 3x (300 DPI high resolution).
   - Page range selection (All pages or custom range like `1-3, 5, 8`).
   - Interactive gallery with enlarged preview modal, individual page download, and "Download All as ZIP" archive.
   - Text extraction with one-click copy and `.txt` file export.

4. **Merge PDFs**:
   - Combine multiple PDF files into one clean document.
   - Reorder file sequence with up/down arrows.
   - Real-time page count and total file size calculation.

5. **100% Client-Side Privacy**:
   - All conversions run locally in the browser using HTML5 Canvas, WebAssembly, and PDF.js.
   - Zero files ever leave the user's computer.

## Quick Start

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build
```
