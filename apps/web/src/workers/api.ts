import type { PageSelection, PdfError, PdfInfo, RenderedPage, Result } from '@vidopdf/core';

/** Contract of the render worker (pdf.js). Only data crosses the boundary. */
export interface RenderWorkerApi {
  /** Phase 0 spike: opens a document, draws its first page and closes it again. */
  renderFirstPage(
    bytes: Uint8Array,
    targetWidth: number,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>>;
}

/** Contract of the export worker (pdf-lib). */
export interface ExportWorkerApi {
  inspect(bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  assemble(
    sources: readonly (readonly [string, Uint8Array])[],
    pages: readonly PageSelection[],
  ): Promise<Result<Uint8Array, PdfError>>;
}
