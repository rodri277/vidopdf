import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { NO_METADATA } from '@vidopdf/core';
import type { Decorations, ExportPage } from '@vidopdf/core';
import { readFormInfo } from './decorate/form-info';
import { createPdfLibWriter } from './pdflib-writer';
import { renderPage } from './testing';
import { fixture } from './testing/fixtures';
import { qpdfCheck } from './testing/qpdf';

const writer = createPdfLibWriter();
const page = (sourceId: string): ExportPage => ({
  kind: 'original',
  sourceId,
  pageIndex: 0,
  rotation: 0,
});

const decorations = (changes: Partial<Decorations> = {}): Decorations => ({
  stamps: [],
  fileName: 'out.pdf',
  date: '',
  metadata: NO_METADATA,
  bookmarks: [],
  forms: {},
  formMode: 'keep',
  ...changes,
});

async function build(pages: readonly ExportPage[], deco?: Decorations) {
  const sources = new Map([
    ['a', fixture('form-1p.pdf')],
    ['b', fixture('form-1p.pdf')],
    ['c', fixture('single-1p.pdf')],
  ]);
  const result = await writer.assemble(
    sources,
    pages,
    deco === undefined ? {} : { decorations: deco },
  );
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.detail ?? ''}`);
  qpdfCheck(result.value);
  return result.value;
}

async function fieldsOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc
    .getForm()
    .getFields()
    .map((field) => field.getName());
}

describe('forms of the files that are merged', () => {
  it('stay fillable after merging, in files with and without a form', async () => {
    const out = await build([page('c'), page('a')]);
    expect((await fieldsOf(out)).sort()).toEqual(['accept', 'full_name']);
  });

  it('two files with a field of the same name do not share it: the second one is renamed', async () => {
    const out = await build([page('a'), page('b')]);
    expect((await fieldsOf(out)).sort()).toEqual([
      'accept',
      'accept_2',
      'full_name',
      'full_name_2',
    ]);
  });

  it('a page used twice gives two independent fields', async () => {
    const out = await build([page('a'), page('a')]);
    expect(await fieldsOf(out)).toHaveLength(4);
  });

  it('no form in, no form out', async () => {
    const out = await build([page('c')]);
    expect(Buffer.from(out).toString('latin1')).not.toContain('/AcroForm');
  });
});

describe('filling the form', () => {
  it('writes the value typed for each file into its own field', async () => {
    const original = (
      await PDFDocument.load(fixture('form-1p.pdf'), { updateMetadata: false })
    ).getForm();
    const out = await build(
      [page('a'), page('b')],
      decorations({
        forms: { a: { full_name: 'Ana Pérez', accept: true }, b: { full_name: 'Luis Gómez' } },
      }),
    );
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const form = doc.getForm();
    expect(form.getTextField('full_name').getText()).toBe('Ana Pérez');
    expect(form.getTextField('full_name_2').getText()).toBe('Luis Gómez');
    expect(form.getCheckBox('accept').isChecked()).toBe(true);
    // Nothing was typed for the second file's box: it keeps what the file had.
    expect(form.getCheckBox('accept_2').isChecked()).toBe(
      original.getCheckBox('accept').isChecked(),
    );
  });

  it('flattens: the value becomes page content and the fields are gone', async () => {
    const out = await build(
      [page('a')],
      decorations({ forms: { a: { full_name: 'Ana Pérez' } }, formMode: 'flatten' }),
    );
    expect(await fieldsOf(out)).toEqual([]);
    expect(Buffer.from(out).toString('latin1')).not.toContain('/AcroForm');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({
      data: out.slice(),
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
    }).promise;
    const text = (await (await doc.getPage(1)).getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    expect(text).toContain('Ana');
    expect((await doc.getPage(1).then((p) => p.getAnnotations())).length).toBe(0);
    // And it still draws.
    expect((await renderPage(out, 1, { scale: 1 })).width).toBeGreaterThan(0);
  });

  it('refuses a value the form font cannot hold, naming the characters', async () => {
    const result = await writer.assemble(new Map([['a', fixture('form-1p.pdf')]]), [page('a')], {
      decorations: decorations({ forms: { a: { full_name: 'Привет' } } }),
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
  });

  it('ignores values for fields that do not exist or are of another kind', async () => {
    const out = await build(
      [page('a')],
      decorations({ forms: { a: { missing: 'x', full_name: true, accept: 'yes' } } }),
    );
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    // A text field is not given a boolean, and a missing field is not an error: the file's own value stays.
    const original = (
      await PDFDocument.load(fixture('form-1p.pdf'), { updateMetadata: false })
    ).getForm();
    expect(doc.getForm().getTextField('full_name').getText()).toBe(
      original.getTextField('full_name').getText(),
    );
  });
});

describe('reading the form of a file', () => {
  it('lists the fields that can be filled, with what they hold', async () => {
    const info = await readFormInfo(fixture('form-1p.pdf'));
    if (!info.ok) throw new Error(info.error.kind);
    expect(info.value.fields.map((field) => [field.name, field.kind])).toEqual([
      ['full_name', 'text'],
      ['accept', 'checkbox'],
    ]);
    expect(info.value.hasXfa).toBe(false);
    expect(info.value.skipped).toBe(0);
  });

  it('says there is nothing in a file without a form, and reports a broken file', async () => {
    const none = await readFormInfo(fixture('single-1p.pdf'));
    expect(none).toMatchObject({ ok: true, value: { fields: [], hasXfa: false } });
    const broken = await readFormInfo(new Uint8Array([1, 2, 3]));
    expect(broken).toMatchObject({ ok: false, error: { kind: 'corrupt' } });
  });
});
