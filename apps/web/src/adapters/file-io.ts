import type { FileIO } from '@vidopdf/core';

interface SavePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what we remove
const FORBIDDEN = /[\u0000-\u001f<>:"/\\|?*]+/g;

/** Strips path separators and control characters so a name can never escape the target folder. */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(FORBIDDEN, '_').trim().replace(/^\.+/, '');
  return cleaned === '' ? 'document.pdf' : cleaned.slice(0, 120);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

export const browserFileIO: FileIO = {
  async save(bytes, suggestedName, mimeType) {
    const name = sanitizeFileName(suggestedName);
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    const picker = (window as SavePickerWindow).showSaveFilePicker;
    if (picker !== undefined) {
      try {
        const handle = await picker({
          suggestedName: name,
          types: [{ description: 'PDF', accept: { [mimeType]: ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Any other failure (no user activation left, permissions): fall back to a plain download.
      }
    }
    download(blob, name);
  },
};
