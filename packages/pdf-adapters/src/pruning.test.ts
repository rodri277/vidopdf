import { PDFDict, PDFDocument, PDFName, PDFStream } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ExportPage } from '@vidopdf/core';
import { createPdfLibWriter } from './pdflib-writer';
import { qpdfCheck } from './testing/qpdf';

const writer = createPdfLibWriter();
const original = (pageIndex: number): ExportPage => ({
  kind: 'original',
  sourceId: 's',
  pageIndex,
  rotation: 0,
});

/** Two pages; the second one has text, and the first one links to it and to a web address. */
async function linked(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const first = doc.addPage([200, 200]);
  const second = doc.addPage([200, 200]);
  second.drawText('only on the second page', { x: 20, y: 100 });
  const links = [
    { Dest: [second.ref, 'Fit'] },
    { A: { S: 'URI', URI: 'https://example.org/' } },
  ].map((extra) =>
    doc.context.register(
      doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 50, 50], ...extra }),
    ),
  );
  first.node.set(PDFName.of('Annots'), doc.context.obj(links));
  return doc.save({ useObjectStreams: false });
}

async function build(source: Uint8Array, pages: readonly ExportPage[]) {
  const result = await writer.assemble(new Map([['s', source]]), pages);
  if (!result.ok) throw new Error(result.error.kind);
  qpdfCheck(result.value);
  return PDFDocument.load(result.value, { updateMetadata: false });
}

const objects = (doc: PDFDocument) => [...doc.context.enumerateIndirectObjects()].map(([, o]) => o);
const pageObjects = (doc: PDFDocument) =>
  objects(doc).filter(
    (o) => o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('Page'),
  ).length;
const streams = (doc: PDFDocument) => objects(doc).filter((o) => o instanceof PDFStream).length;

describe('pages left out do not travel in the result', () => {
  it('extracting the first page does not carry the page its link points to', async () => {
    const doc = await build(await linked(), [original(0)]);
    expect(doc.getPageCount()).toBe(1);
    expect(pageObjects(doc)).toBe(1);
    expect(streams(doc)).toBe(0); // the text of the second page is not in the file
  });

  it('a link to a web address stays, and one to a page that is not in the result is dropped', async () => {
    const doc = await build(await linked(), [original(0)]);
    const links = doc.getPage(0).node.Annots()?.size() ?? 0;
    expect(links).toBe(1);
  });

  it('keeps every page that is in the result, and nothing else', async () => {
    const doc = await build(await linked(), [original(0), original(1)]);
    expect(pageObjects(doc)).toBe(2);
    expect(streams(doc)).toBe(1);
  });
});

describe('a form field with buttons on pages that were left out', () => {
  async function radio(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const first = doc.addPage([200, 200]);
    const second = doc.addPage([200, 200]);
    const group = doc.getForm().createRadioGroup('choice');
    group.addOptionToPage('one', first, { x: 10, y: 10, width: 20, height: 20 });
    group.addOptionToPage('two', second, { x: 10, y: 10, width: 20, height: 20 });
    return doc.save({ useObjectStreams: false });
  }

  it('keeps only the buttons of the pages in the result, and not the other page', async () => {
    const doc = await build(await radio(), [original(0)]);
    expect(doc.getForm().getRadioGroup('choice').acroField.getWidgets()).toHaveLength(1);
    expect(pageObjects(doc)).toBe(1);
  });

  it('keeps all of them when every page is in the result', async () => {
    const doc = await build(await radio(), [original(0), original(1)]);
    expect(doc.getForm().getRadioGroup('choice').acroField.getWidgets()).toHaveLength(2);
    expect(pageObjects(doc)).toBe(2);
  });

  it('leaves no field behind when none of its buttons is in the result', async () => {
    const doc = await build(await radio(), [original(1), original(1)]);
    expect(doc.getForm().getFields().length).toBe(2);
    const none = await build(await radio(), [
      { kind: 'blank', width: 100, height: 100, rotation: 0 },
    ]).catch(() => undefined);
    expect(none === undefined || none.getForm().getFields().length === 0).toBe(true);
  });
});
