import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { pdfjsLib } from './pdfWorker';

const BROWSER_IMAGE_INPUTS = new Set(['png', 'jpg', 'webp', 'gif', 'bmp', 'ico', 'svg']);
const BROWSER_IMAGE_OUTPUTS = new Set(['png', 'jpg', 'webp', 'bmp']);
const BROWSER_MARKUP = new Set(['md', 'html', 'xhtml', 'txt']);
const BROWSER_TABULAR = new Set(['csv', 'tsv', 'json']);
const BROWSER_ZIP = new Set(['zip', 'cbz']);

export function canConvertInBrowser(from: string, to: string): boolean {
  if (from === to) return false;
  if (BROWSER_IMAGE_INPUTS.has(from) && (BROWSER_IMAGE_OUTPUTS.has(to) || to === 'pdf')) return true;
  if (from === 'pdf' && ['png', 'jpg', 'webp', 'txt'].includes(to)) return true;
  if (BROWSER_MARKUP.has(from) && (BROWSER_MARKUP.has(to) || to === 'pdf')) return true;
  if (BROWSER_TABULAR.has(from) && BROWSER_TABULAR.has(to)) return true;
  if (BROWSER_ZIP.has(from) && BROWSER_ZIP.has(to)) return true;
  return false;
}

export interface BrowserConvertOptions {
  dpi: number;
  quality: number; // 10..100
  grayscale: boolean;
  compressionLevel: string;
  selectedEntries: string[];
}

export interface BrowserConvertResult {
  blob: Blob;
  filename: string;
  elapsedMs: number;
}

export async function inspectZipInBrowser(file: File) {
  const zip = await JSZip.loadAsync(file);
  const entries: {
    path: string;
    compressed_bytes: number;
    uncompressed_bytes: number;
    is_dir: boolean;
    encrypted: boolean;
  }[] = [];
  let totalUncompressed = 0;

  zip.forEach((relativePath, entry) => {
    const anyEntry = entry as any;
    const uncomp = anyEntry._data?.uncompressedSize ?? 0;
    const comp = anyEntry._data?.compressedSize ?? 0;
    totalUncompressed += uncomp;
    entries.push({
      path: relativePath,
      compressed_bytes: comp,
      uncompressed_bytes: uncomp,
      is_dir: entry.dir,
      encrypted: false,
    });
  });

  return {
    total_entries: entries.length,
    total_uncompressed_bytes: totalUncompressed,
    total_compressed_bytes: file.size,
    max_ratio: file.size > 0 ? Math.max(1, Math.round(totalUncompressed / file.size)) : 1,
    has_encrypted_entries: false,
    entries: entries.slice(0, 500),
  };
}

export async function convertInBrowser(
  file: File,
  from: string,
  to: string,
  opts: BrowserConvertOptions
): Promise<BrowserConvertResult> {
  const start = performance.now();
  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'converted';
  const outName = `${baseName}.${to}`;

  // 1. Raster / SVG Images -> Raster / PDF
  if (BROWSER_IMAGE_INPUTS.has(from) && (BROWSER_IMAGE_OUTPUTS.has(to) || to === 'pdf')) {
    const blob = await convertImageInBrowser(file, to, opts);
    return { blob, filename: outName, elapsedMs: Math.round(performance.now() - start) };
  }

  // 2. PDF -> Images (PNG/JPG/WEBP) or TXT
  if (from === 'pdf' && ['png', 'jpg', 'webp', 'txt'].includes(to)) {
    const res = await convertPdfInBrowser(file, baseName, to, opts);
    return {
      blob: res.blob,
      filename: res.filename,
      elapsedMs: Math.round(performance.now() - start),
    };
  }

  // 3. Markup (MD / HTML / XHTML / TXT)
  if (BROWSER_MARKUP.has(from) && (BROWSER_MARKUP.has(to) || to === 'pdf')) {
    const text = await file.text();
    const blob = convertMarkupInBrowser(text, from, to);
    return { blob, filename: outName, elapsedMs: Math.round(performance.now() - start) };
  }

  // 4. Tabular (CSV / TSV / JSON)
  if (BROWSER_TABULAR.has(from) && BROWSER_TABULAR.has(to)) {
    const text = await file.text();
    const blob = convertTabularInBrowser(text, from, to);
    return { blob, filename: outName, elapsedMs: Math.round(performance.now() - start) };
  }

  // 5. ZIP / CBZ repacking
  if (BROWSER_ZIP.has(from) && BROWSER_ZIP.has(to)) {
    const srcZip = await JSZip.loadAsync(file);
    const dstZip = new JSZip();
    const levelMap: Record<string, number> = {
      store: 0,
      fast: 1,
      normal: 6,
      maximum: 8,
      ultra: 9,
    };
    const level = levelMap[opts.compressionLevel] ?? 6;
    const tasks: Promise<void>[] = [];

    srcZip.forEach((relPath, entry) => {
      if (entry.dir) return;
      if (opts.selectedEntries.length > 0 && !opts.selectedEntries.includes(relPath)) return;
      tasks.push(
        entry.async('uint8array').then((data) => {
          dstZip.file(relPath, data);
        })
      );
    });
    await Promise.all(tasks);

    const blob = await dstZip.generateAsync({
      type: 'blob',
      compression: level === 0 ? 'STORE' : 'DEFLATE',
      compressionOptions: level === 0 ? undefined : { level },
    });
    return { blob, filename: outName, elapsedMs: Math.round(performance.now() - start) };
  }

  throw new Error(
    `Converting ${from.toUpperCase()} to ${to.toUpperCase()} requires the full conversion server.`
  );
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image in browser'));
    img.src = src;
  });
}

async function convertImageInBrowser(
  file: File,
  to: string,
  opts: BrowserConvertOptions
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1;
    canvas.height = img.naturalHeight || img.height || 1;
    const ctx = canvas.getContext('2d')!;

    if (to === 'jpg' || to === 'bmp' || to === 'pdf') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (opts.grayscale) {
      ctx.filter = 'grayscale(100%)';
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const q = Math.min(1, Math.max(0.1, opts.quality / 100));
    if (to === 'pdf') {
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      const isLandscape = canvas.width > canvas.height;
      const mmPerPx = 25.4 / 96;
      const wMm = canvas.width * mmPerPx;
      const hMm = canvas.height * mmPerPx;
      const doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [wMm, hMm],
      });
      doc.addImage(dataUrl, 'JPEG', 0, 0, wMm, hMm, undefined, 'FAST');
      return doc.output('blob');
    }

    const mime =
      to === 'jpg' ? 'image/jpeg' : to === 'webp' ? 'image/webp' : to === 'bmp' ? 'image/bmp' : 'image/png';
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Browser image encoding failed'))),
        mime,
        q
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function convertPdfInBrowser(
  file: File,
  baseName: string,
  to: string,
  opts: BrowserConvertOptions
): Promise<{ blob: Blob; filename: string }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;

  if (to === 'txt') {
    let fullText = '';
    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const line = tc.items.map((it: any) => ('str' in it ? it.str : '')).join(' ');
      fullText += `--- Page ${p} ---\n\n${line.trim()}\n\n`;
    }
    return {
      blob: new Blob([fullText], { type: 'text/plain;charset=utf-8' }),
      filename: `${baseName}.txt`,
    };
  }

  const scale = Math.max(1, Math.min(3, opts.dpi / 72));
  const mime = to === 'jpg' ? 'image/jpeg' : to === 'webp' ? 'image/webp' : 'image/png';
  const q = Math.min(1, Math.max(0.1, opts.quality / 100));

  const renderPageBlob = async (pageNum: number) => {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;
    if (to !== 'png') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Page render failed'))), mime, q);
    });
  };

  if (numPages === 1) {
    return {
      blob: await renderPageBlob(1),
      filename: `${baseName}.${to}`,
    };
  }

  const zip = new JSZip();
  for (let p = 1; p <= numPages; p++) {
    const pageBlob = await renderPageBlob(p);
    zip.file(`${baseName}_page_${String(p).padStart(3, '0')}.${to}`, pageBlob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    filename: `${baseName}-${to}-pages.zip`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToBasicHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('### ')) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith('## ')) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith('# ')) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed === '') return '<br/>';
      let html = escapeHtml(trimmed);
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      return `<p>${html}</p>`;
    })
    .join('\n');
}

function convertMarkupInBrowser(text: string, from: string, to: string): Blob {
  if (to === 'pdf') {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(text, 180);
    let y = 15;
    for (const line of lines) {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(line, 15, y);
      y += 6;
    }
    return doc.output('blob');
  }

  let out = text;
  if (from === 'md' && (to === 'html' || to === 'xhtml')) {
    const body = markdownToBasicHtml(text);
    out = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"/><title>Document</title></head><body>\n${body}\n</body></html>`;
  } else if (from === 'txt' && (to === 'html' || to === 'xhtml')) {
    out = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"/><title>Document</title></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
  } else if ((from === 'html' || from === 'xhtml') && to === 'txt') {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    out = doc.body.textContent ?? '';
  } else if (from === 'md' && to === 'txt') {
    out = text.replace(/[#*_`>~]/g, '');
  }

  const mime = to === 'html' || to === 'xhtml' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
  return new Blob([out], { type: mime });
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function serializeDelimited(rows: string[][], delimiter: string): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          if (cell.includes('"') || cell.includes(delimiter) || cell.includes('\n')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(delimiter)
    )
    .join('\n');
}

function convertTabularInBrowser(text: string, from: string, to: string): Blob {
  if (from === 'json' && (to === 'csv' || to === 'tsv')) {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr) || arr.length === 0) {
      return new Blob([''], { type: 'text/plain;charset=utf-8' });
    }
    const headers = Object.keys(arr[0]);
    const rows = [
      headers,
      ...arr.map((obj: any) => headers.map((h) => (obj?.[h] == null ? '' : String(obj[h])))),
    ];
    const delim = to === 'tsv' ? '\t' : ',';
    return new Blob([serializeDelimited(rows, delim)], { type: 'text/csv;charset=utf-8' });
  }

  const inDelim = from === 'tsv' ? '\t' : ',';
  const rows = parseDelimited(text.trim(), inDelim);
  if (to === 'json') {
    const [headers = [], ...data] = rows;
    const objs = data.map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h || `col_${idx + 1}`] = r[idx] ?? '';
      });
      return obj;
    });
    return new Blob([JSON.stringify(objs, null, 2)], { type: 'application/json;charset=utf-8' });
  }

  const outDelim = to === 'tsv' ? '\t' : ',';
  return new Blob([serializeDelimited(rows, outDelim)], { type: 'text/csv;charset=utf-8' });
}
