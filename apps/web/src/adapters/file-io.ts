import { safeFileName } from '@vidopdf/core';
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

/** ".pdf" for "report.pdf"; falls back to the extension the MIME type suggests. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '.pdf';
}

function kindOf(mimeType: string): string {
  if (mimeType === 'application/zip') return 'ZIP';
  return mimeType.startsWith('image/') ? mimeType.slice(6).toUpperCase() : 'PDF';
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
    const name = safeFileName(suggestedName, 'document.pdf');
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    const picker = (window as SavePickerWindow).showSaveFilePicker;
    if (picker !== undefined) {
      try {
        const handle = await picker({
          suggestedName: name,
          types: [{ description: kindOf(mimeType), accept: { [mimeType]: [extensionOf(name)] } }],
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
