import type { ExportPage, PdfError, PdfInfo, RenderedPage, Result } from '@vidopdf/core';

/** Contract of the render worker (pdf.js). Only data crosses the boundary. */
export interface RenderWorkerApi {
  /** Opens a document and keeps it for later renders. Takes ownership of `bytes`. */
  open(sourceId: string, bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  /** Draws one page. `requestId` lets the caller cancel it; a cancelled render fails with kind `cancelled`. */
  render(
    requestId: number,
    sourceId: string,
    pageIndex: number,
    targetWidth: number,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>>;
  cancel(requestId: number): void;
  release(sourceId: string): Promise<void>;
}

/** Contract of the export worker (pdf-lib). It owns the source bytes once they are registered. */
export interface ExportWorkerApi {
  /** Checks the file and, if it is usable, keeps its bytes. Takes ownership of `bytes`. */
  register(sourceId: string, bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  release(sourceId: string): void;
  assemble(
    exportId: number,
    pages: readonly ExportPage[],
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<Uint8Array, PdfError>>;
  cancel(exportId: number): void;
}
