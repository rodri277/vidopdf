import type { PDFDocument } from '@cantoo/pdf-lib';
import { hasMetadata } from '@vidopdf/core';
import type { Decorations, PdfError } from '@vidopdf/core';
import { FontSession } from '../fonts/font-session';
import type { FontFile } from '../fonts/font-session';
import { ImageCache } from './images';
import { writeOutline } from './outline';
import { applyStamps } from './stamps';

/** Everything the decorations need besides the document. */
export interface DecorateEnv {
  readonly fonts: readonly FontFile[];
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

function writeMetadata(doc: PDFDocument, metadata: Decorations['metadata']): void {
  if (!hasMetadata(metadata)) return;
  if (metadata.title !== '') doc.setTitle(metadata.title, { showInWindowTitleBar: true });
  if (metadata.author !== '') doc.setAuthor(metadata.author);
  if (metadata.subject !== '') doc.setSubject(metadata.subject);
  if (metadata.keywords.length > 0) doc.setKeywords([...metadata.keywords]);
}

/**
 * Applies stamps, metadata and bookmarks to the assembled document, before it is saved.
 * Fonts are loaded only if a stamp has text, and only the files its characters need.
 */
export async function decorate(
  doc: PDFDocument,
  decorations: Decorations,
  env: DecorateEnv,
): Promise<PdfError | undefined> {
  if (decorations.stamps.length > 0) {
    const failure = await applyStamps({
      doc,
      fonts: new FontSession(doc, env.fonts),
      images: new ImageCache(doc, env.assets),
      decorations,
      total: doc.getPageCount(),
    });
    if (failure !== undefined) return failure;
  }
  writeMetadata(doc, decorations.metadata);
  writeOutline(doc, decorations.bookmarks);
  return undefined;
}

export { ImageCache } from './images';
