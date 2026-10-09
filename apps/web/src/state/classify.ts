import { detectImageKind } from '@vidopdf/core';

export type FileClass =
  | { readonly kind: 'pdf' }
  | { readonly kind: 'image'; readonly format: 'jpeg' | 'png' }
  | { readonly kind: 'rejected'; readonly reason: 'unsupportedImage' | 'notPdf' };

/** How many bytes are enough to tell what a file is. */
export const SNIFF_BYTES = 1024;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/** Acrobat tolerates junk before "%PDF", so the header may sit anywhere in the first kilobyte. */
function hasPdfHeader(head: Uint8Array): boolean {
  for (let start = 0; start + PDF_MAGIC.length <= head.length; start++) {
    if (PDF_MAGIC.every((byte, offset) => head[start + offset] === byte)) return true;
  }
  return false;
}

/**
 * Decides what to do with a dropped file from its first bytes. The name and MIME type are only
 * claims: a PDF called ".jpg" is still a PDF, and a PDF-named file with no PDF in it is reported
 * as damaged (the more helpful message) rather than ignored.
 */
export function classifyFile(head: Uint8Array, name: string, mimeType: string): FileClass {
  const image = detectImageKind(head);
  if (image === 'jpeg' || image === 'png') return { kind: 'image', format: image };
  if (image !== undefined) return { kind: 'rejected', reason: 'unsupportedImage' };
  const claimsPdf = mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
  return hasPdfHeader(head) || claimsPdf ? { kind: 'pdf' } : { kind: 'rejected', reason: 'notPdf' };
}
