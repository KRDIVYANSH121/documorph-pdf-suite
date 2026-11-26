import confetti from 'canvas-confetti';

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Keep ObjectURL alive for 60s so mobile Download Managers (Android/iOS) complete reliably
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function triggerConfetti(): void {
  try {
    confetti({
      particleCount: 70,
      spread: 65,
      origin: { y: 0.6 },
      colors: ['#dc2626', '#ef4444', '#ffffff', '#f43f5e'],
    });
  } catch {
    // Ignore confetti errors if canvas not supported
  }
}
