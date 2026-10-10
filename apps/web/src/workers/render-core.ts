import { IMAGE_FORMATS, err, imageFileName, imageMime, ok, pdfError } from '@vidopdf/core';
import type {
  EncodedImage,
  ImageExportOptions,
  ImageFormat,
  MetadataSettings,
  OutlineEntry,
  PdfError,
  PdfInfo,
  PdfRenderer,
  RenderedPage,
  Result,
  Rotation,
  ZipBuilder,
} from '@vidopdf/core';
import type { ImageJobPage, ProducedFile } from './api';

export interface RenderCoreDeps {
  /** One renderer per open document. */
  readonly createRenderer: () => PdfRenderer<ImageBitmap>;
  readonly createZip: () => ZipBuilder;
  readonly encodeBlank: (
    width: number,
    height: number,
    rotation: Rotation,
    options: ImageExportOptions,
  ) => Promise<Result<EncodedImage, PdfError>>;
  readonly canEncode: (format: ImageFormat) => Promise<boolean>;
}

/**
 * The work of the render worker, without the worker: open documents, thumbnails, outlines and the
 * export of pages as pictures. Kept apart from `render.worker.ts` so it can be tested with fakes.
 */
export function createRenderCore(deps: RenderCoreDeps) {
  const documents = new Map<string, PdfRenderer<ImageBitmap>>();
  const requests = new Map<number, AbortController>();
  const jobs = new Map<number, AbortController>();

  async function open(
    sourceId: string,
    bytes: Uint8Array,
    password?: string,
  ): Promise<Result<PdfInfo, PdfError>> {
    const renderer = deps.createRenderer();
    // The bytes were moved here for this document alone, so pdf.js can have them without a copy.
    const opened = await renderer.open(bytes, {
      takeOwnership: true,
      ...(password === undefined ? {} : { password }),
    });
    if (opened.ok) documents.set(sourceId, renderer);
    else await renderer.close();
    return opened;
  }

  async function render(
    requestId: number,
    sourceId: string,
    pageIndex: number,
    targetWidth: number,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>> {
    const renderer = documents.get(sourceId);
    if (renderer === undefined) return err(pdfError('internal', `unknown source ${sourceId}`));
    const controller = new AbortController();
    requests.set(requestId, controller);
    try {
      return await renderer.renderPage(pageIndex, targetWidth, controller.signal);
    } finally {
      requests.delete(requestId);
    }
  }

  function cancel(requestId: number): void {
    requests.get(requestId)?.abort();
  }

  async function release(sourceId: string): Promise<void> {
    await documents.get(sourceId)?.close();
    documents.delete(sourceId);
  }

  async function outline(sourceId: string): Promise<Result<OutlineEntry[], PdfError>> {
    const renderer = documents.get(sourceId);
    return renderer === undefined
      ? err(pdfError('internal', `unknown source ${sourceId}`))
      : renderer.outline();
  }

  async function metadata(sourceId: string): Promise<Result<MetadataSettings, PdfError>> {
    const renderer = documents.get(sourceId);
    return renderer === undefined
      ? err(pdfError('internal', `unknown source ${sourceId}`))
      : renderer.metadata();
  }

  async function encodableFormats(): Promise<ImageFormat[]> {
    const checks = await Promise.all(
      IMAGE_FORMATS.map(async (format) => [format, await deps.canEncode(format)] as const),
    );
    return checks.filter(([, supported]) => supported).map(([format]) => format);
  }

  /** Pictures are drawn at print size, so pdf.js's caches of decoded images are trimmed this often. */
  const TRIM_EVERY = 20;

  async function pictureOf(
    page: ImageJobPage,
    options: ImageExportOptions,
    signal: AbortSignal,
  ): Promise<Result<EncodedImage, PdfError>> {
    if (page.kind === 'blank')
      return deps.encodeBlank(page.width, page.height, page.rotation, options);
    const renderer = documents.get(page.sourceId);
    if (renderer === undefined) return err(pdfError('internal', `unknown source ${page.sourceId}`));
    return renderer.renderImage(page.pageIndex, options, signal, page.rotation);
  }

  /** Gathers pictures: one is handed back as it is, several are packed in a ZIP (stored, they are already compressed). */
  function collector(count: number, options: ImageExportOptions, baseName: string) {
    const zip = count > 1 ? deps.createZip() : undefined;
    let only: { name: string; bytes: Uint8Array } | undefined;
    let capped = 0;
    return {
      add(index: number, picture: EncodedImage): Result<void, PdfError> {
        if (picture.capped) capped++;
        const name = imageFileName(baseName, index + 1, count, options.format);
        if (zip === undefined) {
          only = { name, bytes: picture.bytes };
          return ok(undefined);
        }
        return zip.add(name, picture.bytes);
      },
      finish(): Result<ProducedFile, PdfError> {
        if (only !== undefined) {
          const { name, bytes } = only;
          return ok({
            kind: 'image',
            name,
            mime: imageMime(options.format),
            bytes,
            fileCount: 1,
            pageCount: 1,
            cappedPages: capped,
          });
        }
        const archive = zip?.finish();
        if (archive === undefined) return err(pdfError('empty', 'nothing to export'));
        if (!archive.ok) return archive;
        return ok({
          kind: 'zip',
          name: `${baseName}-${options.format}.zip`,
          mime: 'application/zip',
          bytes: archive.value,
          fileCount: count,
          pageCount: count,
          cappedPages: capped,
        });
      },
    };
  }

  async function exportImages(
    jobId: number,
    pages: readonly ImageJobPage[],
    options: ImageExportOptions,
    baseName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<ProducedFile, PdfError>> {
    const controller = new AbortController();
    jobs.set(jobId, controller);
    try {
      if (pages.length === 0) return err(pdfError('empty', 'no pages'));
      const files = collector(pages.length, options, baseName);
      for (const [index, page] of pages.entries()) {
        if (controller.signal.aborted) return err(pdfError('cancelled'));
        const picture = await pictureOf(page, options, controller.signal);
        if (page.kind === 'original' && (index + 1) % TRIM_EVERY === 0)
          await documents.get(page.sourceId)?.trim();
        if (!picture.ok) {
          return err(
            pdfError(
              picture.error.kind,
              `page ${String(index + 1)}: ${picture.error.detail ?? picture.error.kind}`,
            ),
          );
        }
        const added = files.add(index, picture.value);
        if (!added.ok) return added;
        onProgress(index + 1, pages.length);
      }
      return files.finish();
    } finally {
      jobs.delete(jobId);
    }
  }

  function cancelJob(jobId: number): void {
    jobs.get(jobId)?.abort();
  }

  return {
    open,
    render,
    cancel,
    release,
    outline,
    metadata,
    encodableFormats,
    exportImages,
    cancelJob,
  };
}
