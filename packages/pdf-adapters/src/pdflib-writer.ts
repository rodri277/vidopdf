import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { err, ok, pdfError } from '@vidopdf/core';
import type { PageSelection, PdfError, PdfInfo, PdfWriter, Result } from '@vidopdf/core';

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

async function loadSources(
  sources: ReadonlyMap<string, Uint8Array>,
  needed: ReadonlySet<string>,
): Promise<Result<Map<string, PDFDocument>, PdfError>> {
  const docs = new Map<string, PDFDocument>();
  for (const sourceId of needed) {
    const bytes = sources.get(sourceId);
    if (bytes === undefined) return err(pdfError('internal', `unknown source ${sourceId}`));
    const loaded = await load(bytes);
    if (!loaded.ok) return loaded;
    docs.set(sourceId, loaded.value);
  }
  return ok(docs);
}

async function copyPage(
  output: PDFDocument,
  docs: ReadonlyMap<string, PDFDocument>,
  selection: PageSelection,
): Promise<PdfError | undefined> {
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
  pages: readonly PageSelection[],
  signal?: AbortSignal,
): Promise<Result<Uint8Array, PdfError>> {
  if (pages.length === 0) return err(pdfError('empty', 'no pages selected'));
  const docs = await loadSources(sources, new Set(pages.map((p) => p.sourceId)));
  if (!docs.ok) return docs;
  const output = await PDFDocument.create();
  for (const selection of pages) {
    if (signal?.aborted === true) return err(pdfError('cancelled'));
    const failure = await copyPage(output, docs.value, selection);
    if (failure !== undefined) return err(failure);
  }
  return ok(await output.save({ useObjectStreams: false }));
}

export function createPdfLibWriter(): PdfWriter {
  return { inspect, assemble };
}
