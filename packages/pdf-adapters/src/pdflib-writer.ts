import { PDFDict, PDFDocument, PDFName, PDFNumber, degrees } from '@cantoo/pdf-lib';
import type { PDFPage } from '@cantoo/pdf-lib';
import { err, ok, pdfError } from '@vidopdf/core';
import { cropBox, decodePermissions, isRestricted } from '@vidopdf/core';
import type {
  ExportPage,
  Permissions,
  PdfError,
  PdfInfo,
  PdfWriter,
  ProtectOptions,
  Result,
  WriteOptions,
} from '@vidopdf/core';
import { decorate, ImageCache } from './decorate';
import { readFormInfo } from './decorate/form-info';
import { applyForms, rebuildForms } from './decorate/forms';
import type { PlacedPage } from './decorate/forms';
import { drawOverlays } from './decorate/overlays';
import { quarterTurn } from './decorate/page-geometry';
import type { FontFile } from './fonts/font-session';
import { imageToPdf } from './image-to-pdf';

const YIELD_EVERY = 8;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What the library says when a file needs a password and when the one given is not it. */
const PASSWORD_INCORRECT = /needs password|password incorrect/i;

/** The `/P` value of an encrypted file, read without opening it. */
function permissionsOf(doc: PDFDocument): number | undefined {
  const reference = doc.context.trailerInfo.Encrypt;
  const dict = reference === undefined ? undefined : doc.context.lookupMaybe(reference, PDFDict);
  const value = dict?.get(PDFName.of('P'));
  return value instanceof PDFNumber ? value.asNumber() : undefined;
}

/** What is taken away from readers by the owner of a file, if anything. */
function restrictionsOf(doc: PDFDocument): number | undefined {
  const p = permissionsOf(doc);
  return p !== undefined && isRestricted(decodePermissions(p)) ? p : undefined;
}

interface Loaded {
  readonly doc: PDFDocument;
  /** The `/P` value when the owner took something away. */
  readonly restrictions: number | undefined;
}

/**
 * Opens a file. A protected file is opened with the password the user typed, and only that: with
 * none, the empty password is tried (files that only restrict what readers may do open that way,
 * as in any viewer) and anything else is reported as needing a password.
 */
async function load(bytes: Uint8Array, password?: string): Promise<Result<Loaded, PdfError>> {
  if (bytes.byteLength === 0) return err(pdfError('empty'));
  try {
    const probe = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    const restrictions = probe.isEncrypted ? restrictionsOf(probe) : undefined;
    const doc = probe.isEncrypted
      ? await PDFDocument.load(bytes, {
          password: password ?? '',
          throwOnInvalidObject: true,
          updateMetadata: false,
        })
      : probe;
    if (doc.getPageCount() === 0) return err(pdfError('empty', 'no pages'));
    return ok({ doc, restrictions });
  } catch (error) {
    if (error instanceof Error && PASSWORD_INCORRECT.test(error.message)) {
      return err(pdfError(password === undefined ? 'passwordRequired' : 'wrongPassword'));
    }
    return err(pdfError('corrupt', describe(error)));
  }
}

async function inspect(bytes: Uint8Array, password?: string): Promise<Result<PdfInfo, PdfError>> {
  const loaded = await load(bytes, password);
  if (!loaded.ok) return loaded;
  const { doc, restrictions } = loaded.value;
  return ok({
    pageCount: doc.getPageCount(),
    ...(restrictions === undefined ? {} : { restrictions }),
  });
}

/** Encrypts a finished PDF with AES-256 (ADR 006); nothing but the library's own cipher is used. */
async function protect(
  bytes: Uint8Array,
  options: ProtectOptions,
): Promise<Result<Uint8Array, PdfError>> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    doc.encrypt({
      userPassword: options.userPassword,
      ownerPassword: options.ownerPassword,
      permissions: toLibraryPermissions(options.permissions),
    });
    return ok(await doc.save({ useObjectStreams: false }));
  } catch (error) {
    return err(pdfError('internal', describe(error)));
  }
}

/** The names the library uses for the permissions of ISO 32000 table 22. */
function toLibraryPermissions(permissions: Permissions) {
  return {
    printing:
      permissions.print === 'none'
        ? false
        : permissions.print === 'high'
          ? 'highResolution'
          : 'lowResolution',
    modifying: permissions.modify,
    copying: permissions.copy,
    annotating: permissions.annotate,
    fillingForms: permissions.fillForms,
    contentAccessibility: permissions.accessibility,
    documentAssembly: permissions.assemble,
  } as const;
}

/**
 * Parsed source documents, kept for as long as their bytes are. Measuring a split by size builds
 * the same pages again and again; parsing each source once makes that affordable.
 */
const parsed = new WeakMap<Uint8Array, PDFDocument>();

async function loadSources(
  sources: ReadonlyMap<string, Uint8Array>,
  needed: ReadonlySet<string>,
  passwords: ReadonlyMap<string, string>,
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
    const loaded = await load(bytes, passwords.get(sourceId));
    if (!loaded.ok) return loaded;
    parsed.set(bytes, loaded.value.doc);
    docs.set(sourceId, loaded.value.doc);
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
  placed: PlacedPage[],
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
  placed.push({ sourceId: selection.sourceId, page });
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
  placed: PlacedPage[],
  options: WriteOptions,
): Promise<PdfError | undefined> {
  for (const [done, selection] of pages.entries()) {
    if (options.signal?.aborted === true) return pdfError('cancelled');
    const failure = await addPage(output, docs, selection, images, placed);
    if (failure !== undefined) return failure;
    options.onProgress?.(done + 1, pages.length);
    // Let a cancel message in a worker's queue be seen without paying a timer per page.
    if ((done + 1) % YIELD_EVERY === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return undefined;
}

/** Rebuilds the form of the output, fills it, and then stamps, titles and bookmarks the document. */
async function finish(
  output: PDFDocument,
  sources: ReadonlyMap<string, PDFDocument>,
  placed: readonly PlacedPage[],
  options: WriteOptions,
  env: { fonts: readonly FontFile[]; assets: ReadonlyMap<string, Uint8Array> },
): Promise<PdfError | undefined> {
  const origins = rebuildForms(output, sources, placed);
  if (options.decorations === undefined) return undefined;
  return (
    (await applyForms(output, origins, options.decorations)) ??
    (await decorate(output, options.decorations, env))
  );
}

async function assembleUnsafe(
  fonts: readonly FontFile[],
  sources: ReadonlyMap<string, Uint8Array>,
  pages: readonly ExportPage[],
  options: WriteOptions,
): Promise<Result<Uint8Array, PdfError>> {
  if (pages.length === 0) return err(pdfError('empty', 'no pages selected'));
  const needed = new Set(pages.flatMap((p) => (p.kind === 'original' ? [p.sourceId] : [])));
  const docs = await loadSources(sources, needed, options.passwords ?? new Map());
  if (!docs.ok) return docs;
  const output = await PDFDocument.create({ updateMetadata: false });
  const assets = options.assets ?? new Map<string, Uint8Array>();
  const images = new ImageCache(output, assets);
  const placed: PlacedPage[] = [];
  const failure =
    (await addPages(output, docs.value, pages, images, placed, options)) ??
    (await finish(output, docs.value, placed, options, { fonts, assets }));
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
    protect,
    readForm: readFormInfo,
    assemble: (sources, pages, options) => assemble(fonts, sources, pages, options),
    fromImage: imageToPdf,
  };
}
export type { FontFile } from './fonts/font-session';
