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
  Rotation,
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
    const canvas = createCanvas(1, 1);
    // A canvas that never had a context refuses to encode (InvalidStateError in browsers).
    canvas.getContext('2d');
    const blob = await canvas.convertToBlob({ type: imageMime(format) });
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

/** A blank page as an image: white paper of the page's size, turned as the user turned it. */
export async function encodeBlankImage(
  widthPoints: number,
  heightPoints: number,
  rotation: Rotation,
  options: ImageExportOptions,
  createCanvas: (width: number, height: number) => RenderCanvas = defaultCanvas,
): Promise<Result<EncodedImage, PdfError>> {
  const sideways = rotation === 90 || rotation === 270;
  const fitted = fitResolution(
    sideways ? heightPoints : widthPoints,
    sideways ? widthPoints : heightPoints,
    options.dpi,
  );
  try {
    const canvas = createCanvas(fitted.width, fitted.height);
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, fitted.width, fitted.height);
    const encoded = await encode(canvas, options);
    return encoded.ok
      ? ok({
          bytes: encoded.value,
          width: fitted.width,
          height: fitted.height,
          dpi: fitted.dpi,
          capped: fitted.capped,
        })
      : encoded;
  } catch (error) {
    return err(fail(error));
  }
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

  async function trim(): Promise<void> {
    // Keep the fonts: loading them again for every page costs more than they weigh.
    try {
      await doc?.cleanup(true);
    } catch {
      // pdf.js refuses while a page is still being drawn; the next trim will do it.
    }
  }

  async function open(
    bytes: Uint8Array,
    options: { readonly takeOwnership?: boolean } = {},
  ): Promise<Result<PdfInfo, PdfError>> {
    await close();
    try {
      // pdf.js transfers the buffer to its worker, so hand it a copy and keep ours usable.
      task = deps.pdfjs.getDocument({
        // pdf.js moves the buffer to its own side, so a caller that keeps using its bytes gets a copy.
        data: options.takeOwnership === true ? bytes : bytes.slice(),
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
  async function paint<P extends { scale: number; width: number; height: number }>(
    pageIndex: number,
    plan: (base: { width: number; height: number }) => P,
    signal: AbortSignal | undefined,
    whiteBackground: boolean,
    extraRotation: Rotation = 0,
  ): Promise<{ canvas: RenderCanvas; width: number; height: number; planned: P }> {
    if (doc === undefined) throw new Error('no document open');
    const page = await doc.getPage(pageIndex + 1);
    // pdf.js wants the total turn; the page already carries its own /Rotate.
    const rotation = (page.rotate + extraRotation) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const planned = plan(base);
    const { scale, width, height } = planned;
    const viewport = page.getViewport({ scale, rotation });
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
    return { canvas, width, height, planned };
  }

  async function renderPage(
    pageIndex: number,
    targetWidth: number,
    signal?: AbortSignal,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>> {
    if (doc === undefined) return err(pdfError('internal', 'no document open'));
    if (signal?.aborted === true) return err(pdfError('cancelled'));
    try {
      const { canvas, width, height, planned } = await paint(
        pageIndex,
        (base) => {
          const scale = pickScale(base.width, base.height, targetWidth);
          return {
            scale,
            width: Math.ceil(base.width * scale),
            height: Math.ceil(base.height * scale),
            points: { width: base.width, height: base.height },
          };
        },
        signal,
        false,
      );
      return ok({
        width,
        height,
        image: canvas.transferToImageBitmap(),
        pointsWidth: planned.points.width,
        pointsHeight: planned.points.height,
      });
    } catch (error) {
      return err(fail(error));
    }
  }

  async function renderImage(
    pageIndex: number,
    options: ImageExportOptions,
    signal?: AbortSignal,
    rotation: Rotation = 0,
  ): Promise<Result<EncodedImage, PdfError>> {
    if (doc === undefined) return err(pdfError('internal', 'no document open'));
    if (signal?.aborted === true) return err(pdfError('cancelled'));
    try {
      const { canvas, width, height, planned } = await paint(
        pageIndex,
        (base) => {
          const fitted = fitResolution(base.width, base.height, options.dpi);
          return {
            scale: fitted.width / base.width,
            width: fitted.width,
            height: fitted.height,
            fitted,
          };
        },
        signal,
        // A page is white paper; without this PNG would keep it transparent and JPEG would turn it black.
        true,
        rotation,
      );
      const encoded = await encode(canvas, options);
      // A full-size page is tens of megabytes of pixels; do not wait for the garbage collector.
      canvas.width = 0;
      canvas.height = 0;
      const { dpi, capped } = planned.fitted;
      return encoded.ok ? ok({ bytes: encoded.value, width, height, dpi, capped }) : encoded;
    } catch (error) {
      return err(fail(error));
    }
  }

  async function outline(): Promise<Result<OutlineEntry[], PdfError>> {
    if (doc === undefined) return err(pdfError('internal', 'no document open'));
    return readOutline(doc);
  }

  return { open, renderPage, renderImage, outline, trim, close };
}
