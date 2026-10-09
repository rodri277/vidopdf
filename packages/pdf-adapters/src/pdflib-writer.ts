import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import type { PDFPage } from '@cantoo/pdf-lib';
import { err, ok, pdfError } from '@vidopdf/core';
import type { ExportPage, PdfError, PdfInfo, PdfWriter, Result, WriteOptions } from '@vidopdf/core';
import { cropBox } from '@vidopdf/core';
import { decorate, ImageCache } from './decorate';
import { drawOverlays } from './decorate/overlays';
import { quarterTurn } from './decorate/page-geometry';
import type { FontFile } from './fonts/font-session';
import { imageToPdf } from './image-to-pdf';

const YIELD_EVERY = 8;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Loads without decrypting: encrypted input is detected and rejected, never opened (SPEC §7). */
async function load(bytes: Uint8Array): Promise<Result<PDFDocument, PdfError>> {
  if (bytes.byteLength === 0) return err(pdfError('empty'));
  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: true,
    });
    if (doc.isEncrypted) return err(pdfError('encrypted'));
    if (doc.getPageCount() === 0) return err(pdfError('empty', 'no pages'));
    return ok(doc);
  } catch (error) {
    return err(pdfError('corrupt', describe(error)));
  }
}

async function inspect(bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>> {
  const loaded = await load(bytes);
  return loaded.ok ? ok({ pageCount: loaded.value.getPageCount() }) : loaded;
}

/**
 * Parsed source documents, kept for as long as their bytes are. Measuring a split by size builds
 * the same pages again and again; parsing each source once makes that affordable.
 */
const parsed = new WeakMap<Uint8Array, PDFDocument>();

async function loadSources(
  sources: ReadonlyMap<string, Uint8Array>,
  needed: ReadonlySet<string>,
): Promise<Result<Map<string, PDFDocument>, PdfError>> {
  const docs = new Map<string, PDFDocument>();
  for (const sourceId of needed) {
    const bytes = sources.get(sourceId);
    if (bytes === undefined) return err(pdfError('internal', `unknown source ${sourceId}`));
    const cached = parsed.get(bytes);
    if (cached !== undefined) {
      docs.set(sourceId, cached);
      continue;
    }
    const loaded = await load(bytes);
    if (!loaded.ok) return loaded;
    parsed.set(bytes, loaded.value);
    docs.set(sourceId, loaded.value);
  }
  return ok(docs);
}

/** Cuts the page to what the reader sees minus the margins; the rest stays in the file (ADR 006). */
function applyCrop(
  page: PDFPage,
  margins: NonNullable<Extract<ExportPage, { kind: 'original' }>['crop']>,
): void {
  const base = page.getCropBox();
  const box = cropBox(
    { width: base.width, height: base.height },
    margins,
    quarterTurn(page.getRotation().angle),
  );
  page.setCropBox(base.x + box.x, base.y + box.y, box.width, box.height);
}

async function addPage(
  output: PDFDocument,
  docs: ReadonlyMap<string, PDFDocument>,
  selection: ExportPage,
  images: ImageCache,
): Promise<PdfError | undefined> {
  if (selection.kind === 'blank') {
    output.addPage([selection.width, selection.height]).setRotation(degrees(selection.rotation));
    return undefined;
  }
  const source = docs.get(selection.sourceId);
  if (source === undefined || selection.pageIndex >= source.getPageCount()) {
    return pdfError('internal', `page ${String(selection.pageIndex)} of ${selection.sourceId}`);
  }
  const [page] = await output.copyPages(source, [selection.pageIndex]);
  if (page === undefined) return pdfError('internal', 'copyPages returned nothing');
  // Some files carry /Rotate -90 or 450; both are legal, the sum is kept in 0 to 270.
  const turned = (((page.getRotation().angle + selection.rotation) % 360) + 360) % 360;
  page.setRotation(degrees(turned));
  output.addPage(page);
  if (selection.crop !== undefined) applyCrop(page, selection.crop);
  return selection.overlays === undefined
    ? undefined
    : drawOverlays(page, selection.overlays, images);
}

async function assemble(
  fonts: readonly FontFile[],
  sources: ReadonlyMap<string, Uint8Array>,
  pages: readonly ExportPage[],
  options: WriteOptions = {},
): Promise<Result<Uint8Array, PdfError>> {
  try {
    return await assembleUnsafe(fonts, sources, pages, options);
  } catch (error) {
    // A file that loaded can still fail while its pages are copied (a broken object deep inside).
    return err(pdfError('corrupt', describe(error)));
  }
}

/** Adds every page in order, with progress, and stops when asked to. */
async function addPages(
  output: PDFDocument,
  docs: ReadonlyMap<string, PDFDocument>,
  pages: readonly ExportPage[],
  images: ImageCache,
  options: WriteOptions,
): Promise<PdfError | undefined> {
  for (const [done, selection] of pages.entries()) {
    if (options.signal?.aborted === true) return pdfError('cancelled');
    const failure = await addPage(output, docs, selection, images);
    if (failure !== undefined) return failure;
    options.onProgress?.(done + 1, pages.length);
    // Let a cancel message in a worker's queue be seen without paying a timer per page.
    if ((done + 1) % YIELD_EVERY === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return undefined;
}

async function assembleUnsafe(
  fonts: readonly FontFile[],
  sources: ReadonlyMap<string, Uint8Array>,
  pages: readonly ExportPage[],
  options: WriteOptions,
): Promise<Result<Uint8Array, PdfError>> {
  if (pages.length === 0) return err(pdfError('empty', 'no pages selected'));
  const needed = new Set(pages.flatMap((p) => (p.kind === 'original' ? [p.sourceId] : [])));
  const docs = await loadSources(sources, needed);
  if (!docs.ok) return docs;
  const output = await PDFDocument.create({ updateMetadata: false });
  const assets = options.assets ?? new Map<string, Uint8Array>();
  const images = new ImageCache(output, assets);
  const failure =
    (await addPages(output, docs.value, pages, images, options)) ??
    (options.decorations === undefined
      ? undefined
      : await decorate(output, options.decorations, { fonts, assets }));
  return failure === undefined ? ok(await output.save({ useObjectStreams: false })) : err(failure);
}

export interface PdfLibWriterConfig {
  /** The fonts stamps may use (the Inter files of the app). Loaded only if a stamp has text. */
  readonly fonts?: readonly FontFile[];
}

export function createPdfLibWriter(config: PdfLibWriterConfig = {}): PdfWriter {
  const fonts = config.fonts ?? [];
  return {
    inspect,
    assemble: (sources, pages, options) => assemble(fonts, sources, pages, options),
    fromImage: imageToPdf,
  };
}
