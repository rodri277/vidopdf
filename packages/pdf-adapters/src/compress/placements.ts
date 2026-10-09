import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import type { PDFContext, PDFDocument, PDFObject, PDFPage } from '@cantoo/pdf-lib';
import { IDENTITY, drawnObjects, drawnSize, multiply } from '@vidopdf/core';
import type { Matrix } from '@vidopdf/core';

/** Forms inside forms inside forms: deeper than this is a loop or an attack, not a document. */
const MAX_DEPTH = 4;

function lookupDict(context: PDFContext, value: PDFObject | undefined): PDFDict | undefined {
  const resolved = value === undefined ? undefined : context.lookup(value);
  if (resolved instanceof PDFDict) return resolved;
  return resolved instanceof PDFStream ? resolved.dict : undefined;
}

/** The decoded bytes of a content stream, or nothing when it cannot be decoded. */
function contentOf(stream: PDFObject | undefined, context: PDFContext): Uint8Array | undefined {
  const resolved = stream === undefined ? undefined : context.lookup(stream);
  if (resolved instanceof PDFRawStream) {
    try {
      return decodePDFRawStream(resolved).decode();
    } catch {
      return undefined;
    }
  }
  return resolved instanceof PDFStream ? resolved.getContents() : undefined;
}

function pageContent(page: PDFPage, context: PDFContext): Uint8Array {
  const contents = page.node.Contents();
  const parts: Uint8Array[] = [];
  if (contents instanceof PDFArray) {
    for (let index = 0; index < contents.size(); index++) {
      const part = contentOf(contents.get(index), context);
      if (part !== undefined) parts.push(part, new Uint8Array([0x0a]));
    }
  } else {
    const part = contentOf(contents, context);
    if (part !== undefined) parts.push(part);
  }
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function matrixOf(context: PDFContext, form: PDFDict): Matrix {
  const raw = form.get(PDFName.of('Matrix'));
  const array = raw === undefined ? undefined : context.lookup(raw);
  if (!(array instanceof PDFArray) || array.size() !== 6) return IDENTITY;
  const values = Array.from({ length: 6 }, (_, i) => {
    const n = context.lookup(array.get(i));
    return n instanceof PDFNumber ? n.asNumber() : 0;
  });
  return values as unknown as Matrix;
}

type Dpis = Map<string, number>;

function record(
  dpis: Dpis,
  ref: PDFRef,
  pixels: { width: number; height: number },
  matrix: Matrix,
): void {
  const size = drawnSize(matrix);
  if (size.width <= 0 || size.height <= 0) return;
  // Dots per inch along each side; the sharper of the two is what the picture is drawn at.
  const dpi = Math.max((pixels.width * 72) / size.width, (pixels.height * 72) / size.height);
  const key = ref.toString();
  dpis.set(key, Math.max(dpis.get(key) ?? 0, dpi));
}

/** The form XObject a reference points at, if it is one. */
function formAt(context: PDFContext, ref: PDFRef): PDFStream | undefined {
  const form = context.lookup(ref);
  if (!(form instanceof PDFStream)) return undefined;
  const subtype = form.dict.get(PDFName.of('Subtype'));
  return subtype instanceof PDFName && subtype.decodeText() === 'Form' ? form : undefined;
}

function walk(
  context: PDFContext,
  content: Uint8Array,
  resources: PDFDict | undefined,
  start: Matrix,
  pixels: ReadonlyMap<string, { width: number; height: number }>,
  dpis: Dpis,
  depth: number,
): void {
  const xobjects = lookupDict(context, resources?.get(PDFName.of('XObject')));
  if (xobjects === undefined) return;
  for (const { name, matrix } of drawnObjects(content, start)) {
    const ref = xobjects.get(PDFName.of(name));
    if (!(ref instanceof PDFRef)) continue;
    const known = pixels.get(ref.toString());
    if (known !== undefined) {
      record(dpis, ref, known, matrix);
      continue;
    }
    const form = depth < MAX_DEPTH ? formAt(context, ref) : undefined;
    if (form !== undefined) enter(context, form, resources, matrix, pixels, dpis, depth);
  }
}

/** Reads the content of a form drawn with `matrix`, which may bring its own resources. */
function enter(
  context: PDFContext,
  form: PDFStream,
  outer: PDFDict | undefined,
  matrix: Matrix,
  pixels: ReadonlyMap<string, { width: number; height: number }>,
  dpis: Dpis,
  depth: number,
): void {
  const inner = contentOf(form, context);
  if (inner === undefined) return;
  const own = lookupDict(context, form.dict.get(PDFName.of('Resources'))) ?? outer;
  const placed = multiply(matrixOf(context, form.dict), matrix);
  walk(context, inner, own, placed, pixels, dpis, depth + 1);
}

/**
 * For every picture of the document, the highest resolution (dots per inch) at which any page
 * draws it, found by reading the pages' content streams and the forms they use. Pictures that no
 * page draws, or that are drawn from places this does not read, are not in the result.
 */
export function effectiveDpis(
  doc: PDFDocument,
  pixels: ReadonlyMap<string, { width: number; height: number }>,
): Map<string, number> {
  const dpis: Dpis = new Map();
  for (const page of doc.getPages()) {
    const resources = lookupDict(doc.context, page.node.Resources());
    walk(doc.context, pageContent(page, doc.context), resources, IDENTITY, pixels, dpis, 0);
  }
  return dpis;
}
