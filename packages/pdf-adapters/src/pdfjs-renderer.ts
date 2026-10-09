import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { err, ok, pdfError } from '@vidopdf/core';
import { MAX_CANVAS_PIXELS, pickScale } from './scale';
import type {
  PdfError,
  PdfErrorKind,
  PdfInfo,
  PdfRenderer,
  RenderedPage,
  Result,
} from '@vidopdf/core';

export interface PdfjsAssets {
  /** URL of `pdf.worker.min.mjs`, served from our own origin. */
  readonly workerSrc: string;
  /** Base URL (with trailing slash) holding `cmaps/`, `standard_fonts/`, `iccs/` and `wasm/`. */
  readonly assetBaseUrl: string;
}

function kindOf(error: unknown): PdfErrorKind {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return 'encrypted';
  if (name === 'AbortException' || name === 'RenderingCancelledException') return 'cancelled';
  return 'corrupt';
}

function fail(error: unknown): PdfError {
  return pdfError(kindOf(error), error instanceof Error ? error.message : String(error));
}

/** pdf.js renderer for a browser worker (needs OffscreenCanvas). One instance holds one document. */
export function createPdfjsRenderer(assets: PdfjsAssets): PdfRenderer<ImageBitmap> {
  GlobalWorkerOptions.workerSrc = assets.workerSrc;
  let task: PDFDocumentLoadingTask | undefined;
  let doc: PDFDocumentProxy | undefined;

  async function close(): Promise<void> {
    await task?.destroy();
    task = undefined;
    doc = undefined;
  }

  async function open(bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>> {
    await close();
    try {
      // pdf.js transfers the buffer to its worker, so hand it a copy and keep ours usable.
      task = getDocument({
        data: bytes.slice(),
        // pdfjs-dist 6 has no eval path (the old `isEvalSupported` option is gone) and runs no
        // embedded JavaScript unless a viewer enables scripting, which we never do.
        maxImageSize: MAX_CANVAS_PIXELS,
        // We run inside a worker, where there is no `document`: pdf.js must not use FontFace, and
        // must fetch its data files itself (its other fetch paths read document.baseURI).
        useWorkerFetch: true,
        disableFontFace: true,
        cMapUrl: `${assets.assetBaseUrl}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets.assetBaseUrl}standard_fonts/`,
        iccUrl: `${assets.assetBaseUrl}iccs/`,
        wasmUrl: `${assets.assetBaseUrl}wasm/`,
      });
      doc = await task.promise;
      return ok({ pageCount: doc.numPages });
    } catch (error) {
      return err(fail(error));
    }
  }

  async function renderPage(
    pageIndex: number,
    targetWidth: number,
    signal?: AbortSignal,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>> {
    if (doc === undefined) return err(pdfError('internal', 'no document open'));
    if (signal?.aborted === true) return err(pdfError('cancelled'));
    try {
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pickScale(base.width, base.height, targetWidth) });
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const render = page.render({
        // pdf.js types ask for an HTMLCanvasElement but only uses the 2D context API.
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      });
      signal?.addEventListener(
        'abort',
        () => {
          render.cancel();
        },
        { once: true },
      );
      await render.promise;
      page.cleanup();
      return ok({
        width: canvas.width,
        height: canvas.height,
        image: canvas.transferToImageBitmap(),
      });
    } catch (error) {
      return err(fail(error));
    }
  }

  return { open, renderPage, close };
}
