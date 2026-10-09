import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { err, ok, pdfError } from '@vidopdf/core';
import type { ExportPage, PdfError, PdfInfo, PdfWriter, Result, WriteOptions } from '@vidopdf/core';
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

async function addPage(
  output: PDFDocument,
  docs: ReadonlyMap<string, PDFDocument>,
  selection: ExportPage,
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
  const base = page.getRotation().angle;
  page.setRotation(degrees((base + selection.rotation) % 360));
  output.addPage(page);
  return undefined;
}

async function assemble(
  sources: ReadonlyMap<string, Uint8Array>,
  pages: readonly ExportPage[],
  options: WriteOptions = {},
): Promise<Result<Uint8Array, PdfError>> {
  if (pages.length === 0) return err(pdfError('empty', 'no pages selected'));
  const needed = new Set(pages.flatMap((p) => (p.kind === 'original' ? [p.sourceId] : [])));
  const docs = await loadSources(sources, needed);
  if (!docs.ok) return docs;
  const output = await PDFDocument.create();
  for (const [done, selection] of pages.entries()) {
    if (options.signal?.aborted === true) return err(pdfError('cancelled'));
    const failure = await addPage(output, docs.value, selection);
    if (failure !== undefined) return err(failure);
    options.onProgress?.(done + 1, pages.length);
    // Let a cancel message in a worker's queue be seen without paying a timer per page.
    if ((done + 1) % YIELD_EVERY === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return ok(await output.save({ useObjectStreams: false }));
}

export function createPdfLibWriter(): PdfWriter {
  return { inspect, assemble, fromImage: imageToPdf };
}
