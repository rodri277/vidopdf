import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import {
  MAX_CANVAS_PIXELS,
  clampQuality,
  err,
  fitResolution,
  imageMime,
  ok,
  pdfError,
} from '@vidopdf/core';
import type {
  EncodedImage,
  ImageExportOptions,
  ImageFormat,
  OutlineEntry,
  PdfError,
  PdfErrorKind,
  PdfInfo,
  PdfRenderer,
  RenderedPage,
  Result,
} from '@vidopdf/core';
import { readOutline } from './outline';
import { pickScale } from './scale';

export interface PdfjsAssets {
  /** URL of `pdf.worker.min.mjs`, served from our own origin. */
  readonly workerSrc: string;
  /** Base URL (with trailing slash) holding `cmaps/`, `standard_fonts/`, `iccs/` and `wasm/`. */
  readonly assetBaseUrl: string;
}

/** What the renderer uses of pdf.js; the web app passes the real module, tests the Node build. */
export interface PdfjsLib {
  readonly GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: Record<string, unknown>): PDFDocumentLoadingTask;
}

/** The slice of OffscreenCanvas the renderer needs. */
export interface RenderCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): unknown;
  convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob>;
  transferToImageBitmap(): ImageBitmap;
}

export interface RendererDeps {
  readonly pdfjs: PdfjsLib;
  /** Defaults to `new OffscreenCanvas(...)`. */
  readonly createCanvas?: (width: number, height: number) => RenderCanvas;
  /** Merged over the options given to `getDocument` (tests turn worker fetching off). */
  readonly documentOptions?: Record<string, unknown>;
}

const defaultCanvas = (width: number, height: number): RenderCanvas =>
  new OffscreenCanvas(width, height);

function kindOf(error: unknown): PdfErrorKind {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return 'encrypted';
  if (name === 'AbortException' || name === 'RenderingCancelledException') return 'cancelled';
  return 'corrupt';
}

function fail(error: unknown): PdfError {
  return pdfError(kindOf(error), error instanceof Error ? error.message : String(error));
}

/** Can this browser encode pictures in the given format from a canvas? (Safari cannot do WebP.) */
export async function canEncodeImage(
  format: ImageFormat,
  createCanvas: (width: number, height: number) => RenderCanvas = defaultCanvas,
): Promise<boolean> {
  try {
    const blob = await createCanvas(1, 1).convertToBlob({ type: imageMime(format) });
    return blob.type === imageMime(format);
  } catch {
    return false;
  }
}

/** Encodes the canvas in the requested format, or says so when the browser would give another one. */
async function encode(
  canvas: RenderCanvas,
  options: ImageExportOptions,
): Promise<Result<Uint8Array, PdfError>> {
  const mime = imageMime(options.format);
  const blob = await canvas.convertToBlob(
    options.format === 'png'
      ? { type: mime }
      : { type: mime, quality: clampQuality(options.quality) },
  );
  if (blob.type !== mime)
    return err(pdfError('unsupported', `this browser cannot encode ${options.format}`));
  return ok(new Uint8Array(await blob.arrayBuffer()));
}

/** pdf.js renderer for a browser worker (needs OffscreenCanvas). One instance holds one document. */
export function createPdfjsRenderer(
  assets: PdfjsAssets,
  deps: RendererDeps,
): PdfRenderer<ImageBitmap> {
  const createCanvas = deps.createCanvas ?? defaultCanvas;
  deps.pdfjs.GlobalWorkerOptions.workerSrc = assets.workerSrc;
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
      task = deps.pdfjs.getDocument({
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
        ...deps.documentOptions,
      });
      doc = await task.promise;
      return ok({ pageCount: doc.numPages });
    } catch (error) {
      return err(fail(error));
    }
  }

  /** Draws a page onto a canvas of the given size, cancelling the draw if the signal fires. */
  async function paint(
    pageIndex: number,
    plan: (base: { width: number; height: number }) => {
      scale: number;
      width: number;
      height: number;
    },
    signal: AbortSignal | undefined,
    whiteBackground: boolean,
  ): Promise<{ canvas: RenderCanvas; width: number; height: number }> {
    if (doc === undefined) throw new Error('no document open');
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const { scale, width, height } = plan(base);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (whiteBackground) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    const render = page.render({
      // pdf.js types ask for DOM canvas classes but only uses the 2D drawing API.
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context,
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
    return { canvas, width, height };
  }

  async function renderPage(
    pageIndex: number,
    targetWidth: number,
    signal?: AbortSignal,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>> {
    if (doc === undefined) return err(pdfError('internal', 'no document open'));
    if (signal?.aborted === true) return err(pdfError('cancelled'));
    try {
      const { canvas, width, height } = await paint(
        pageIndex,
        (base) => {
          const scale = pickScale(base.width, base.height, targetWidth);
          return {
            scale,
            width: Math.ceil(base.width * scale),
            height: Math.ceil(base.height * scale),
          };
        },
        signal,
        false,
      );
      return ok({ width, height, image: canvas.transferToImageBitmap() });
    } catch (error) {
      return err(fail(error));
    }
  }

  async function renderImage(
    pageIndex: number,
    options: ImageExportOptions,
    signal?: AbortSignal,
  ): Promise<Result<EncodedImage, PdfError>> {
    if (doc === undefined) return err(pdfError('internal', 'no document open'));
    if (signal?.aborted === true) return err(pdfError('cancelled'));
    try {
      let fitted: ReturnType<typeof fitResolution> | undefined;
      const { canvas, width, height } = await paint(
        pageIndex,
        (base) => {
          fitted = fitResolution(base.width, base.height, options.dpi);
          return { scale: fitted.width / base.width, width: fitted.width, height: fitted.height };
        },
        signal,
        // A page is white paper; without this PNG would keep it transparent and JPEG would turn it black.
        true,
      );
      const encoded = await encode(canvas, options);
      return encoded.ok
        ? ok({
            bytes: encoded.value,
            width,
            height,
            dpi: fitted?.dpi ?? options.dpi,
            capped: fitted?.capped ?? false,
          })
        : encoded;
    } catch (error) {
      return err(fail(error));
    }
  }

  async function outline(): Promise<Result<OutlineEntry[], PdfError>> {
    if (doc === undefined) return err(pdfError('internal', 'no document open'));
    return readOutline(doc);
  }

  return { open, renderPage, renderImage, outline, close };
}
