import * as pdfjs from 'pdfjs-dist';
import type { PdfRenderer } from '@vidopdf/core';
import { createPdfjsRenderer } from './pdfjs-renderer';
import type { PdfjsAssets } from './pdfjs-renderer';

export { canEncodeImage } from './pdfjs-renderer';
export type { PdfjsAssets } from './pdfjs-renderer';

/** The renderer wired to the real pdf.js, for the render worker. Only workers may import this. */
export function createBrowserRenderer(assets: PdfjsAssets): PdfRenderer<ImageBitmap> {
  return createPdfjsRenderer(assets, { pdfjs });
}
