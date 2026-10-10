import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFObject, PDFPage } from '@cantoo/pdf-lib';
import type { PlacedPage } from './forms';

const ANNOTS = PDFName.of('Annots');
const DEST = PDFName.of('Dest');
const ACTION = PDFName.of('A');

function annotationsOf(page: PDFPage): { array: PDFArray; refs: PDFRef[] } | undefined {
  const array = page.node.lookupMaybe(ANNOTS, PDFArray);
  if (array === undefined) return undefined;
  const refs: PDFRef[] = [];
  for (let index = 0; index < array.size(); index++) {
    const item = array.get(index);
    if (item instanceof PDFRef) refs.push(item);
  }
  return { array, refs };
}

/** Where a link goes: its destination, or the destination of its go-to action. */
function destinationOf(annot: PDFDict): PDFObject | undefined {
  const direct = annot.get(DEST);
  if (direct !== undefined) return direct;
  const action = annot.context.lookupMaybe(annot.get(ACTION), PDFDict);
  return action?.get(PDFName.of('S')) === PDFName.of('GoTo')
    ? action.get(PDFName.of('D'))
    : undefined;
}

/** A link to a place inside the document that is not a page of the result. */
function isDeadLink(output: PDFDocument, annot: PDFDict, kept: ReadonlySet<PDFRef>): boolean {
  const target = destinationOf(annot);
  if (target === undefined || annot.get(PDFName.of('Subtype')) !== PDFName.of('Link')) return false;
  const first = output.context.lookupMaybe(target, PDFArray)?.get(0);
  return !(first instanceof PDFRef) || !kept.has(first);
}

/**
 * Copying a page also copies every page its annotations point to, as loose objects with all their
 * content. When pages are left out of the result, that would carry them along. So the annotations
 * of the pages we keep point at the page they sit on, and links to a page that is not in the
 * result are dropped (they could not go anywhere anyway). Links to a web address stay.
 */
export function tidyAnnotations(output: PDFDocument, placed: readonly PlacedPage[]): void {
  const kept = new Set(output.getPages().map((page) => page.ref));
  for (const { page } of placed) {
    const found = annotationsOf(page);
    if (found === undefined) continue;
    const drop = new Set<PDFRef>();
    for (const ref of found.refs) {
      const annot = output.context.lookupMaybe(ref, PDFDict);
      if (annot === undefined) continue;
      if (annot.has(PDFName.of('P'))) annot.set(PDFName.of('P'), page.ref);
      if (isDeadLink(output, annot, kept)) drop.add(ref);
    }
    for (let index = found.array.size() - 1; index >= 0; index--) {
      const item = found.array.get(index);
      if (item instanceof PDFRef && drop.has(item)) found.array.remove(index);
    }
  }
}

function referencesOf(object: PDFObject | undefined, into: PDFRef[]): void {
  if (object instanceof PDFRef) into.push(object);
  else if (object instanceof PDFArray)
    for (let index = 0; index < object.size(); index++) referencesOf(object.get(index), into);
  else if (object instanceof PDFStream) referencesOf(object.dict, into);
  else if (object instanceof PDFDict)
    for (const [, value] of object.entries()) referencesOf(value, into);
}

/**
 * Deletes the objects nothing reaches from the document any more. Without this a page, a picture
 * or a font that was copied by accident would still travel inside the file.
 */
export function dropUnreachable(output: PDFDocument): void {
  const { context } = output;
  const seen = new Set<PDFRef>();
  const pending: PDFRef[] = [];
  const { Root, Info, Encrypt, ID } = context.trailerInfo;
  for (const root of [Root, Info, Encrypt, ID]) referencesOf(root, pending);
  for (let ref = pending.pop(); ref !== undefined; ref = pending.pop()) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    referencesOf(context.lookup(ref), pending);
  }
  for (const [ref] of context.enumerateIndirectObjects()) if (!seen.has(ref)) context.delete(ref);
}
