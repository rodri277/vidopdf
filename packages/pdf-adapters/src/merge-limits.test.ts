import { PDFDocument } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { createPdfLibWriter } from './pdflib-writer';
import { fixture } from './testing/fixtures';

/**
 * What survives `copyPages` when pages are merged. These tests pin the CURRENT behaviour of
 * @cantoo/pdf-lib so that the README's "Known limitations" stay true; if one starts failing
 * because a limit was fixed (or got worse), update the README with it.
 */
const writer = createPdfLibWriter();

async function merged(name: string, pageCount: number): Promise<Uint8Array> {
  const pages = Array.from({ length: pageCount }, (_, pageIndex) => ({
    kind: 'original' as const,
    sourceId: 'a',
    pageIndex,
    rotation: 0 as const,
  }));
  const result = await writer.assemble(new Map([['a', fixture(name)]]), pages);
  if (!result.ok) throw new Error(`assemble failed: ${result.error.kind}`);
  return result.value;
}

async function catalogKeys(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return [...doc.catalog.keys()].map((key) => key.toString());
}

async function readWith<T>(
  bytes: Uint8Array,
  read: (doc: Awaited<ReturnType<typeof open>>) => Promise<T>,
): Promise<T> {
  const task = getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  try {
    return await read(doc);
  } finally {
    await task.destroy();
  }
}
interface Annotation {
  subtype: string;
  url?: string;
}

/** pdf.js types annotations as `any`; this is the part of them the tests look at. */
async function annotationsOf(bytes: Uint8Array): Promise<Annotation[]> {
  return readWith(
    bytes,
    async (doc) => (await (await doc.getPage(1)).getAnnotations()) as Annotation[],
  );
}

const open = (bytes: Uint8Array) => getDocument({ data: bytes.slice() }).promise;

describe('known limits of merging with copyPages', () => {
  it('LOSES bookmarks (the outline)', async () => {
    const source = fixture('bookmarks-3p.pdf');
    expect(await readWith(source, (doc) => doc.getOutline())).toHaveLength(3);
    const out = await merged('bookmarks-3p.pdf', 3);
    expect(await catalogKeys(out)).not.toContain('/Outlines');
    expect(await readWith(out, (doc) => doc.getOutline())).toBeNull();
  });

  it('LOSES the form definition: widgets stay visible but are no longer fillable fields', async () => {
    const source = fixture('form-1p.pdf');
    expect(await catalogKeys(source)).toContain('/AcroForm');
    const out = await merged('form-1p.pdf', 1);
    expect(await catalogKeys(out)).not.toContain('/AcroForm');
    expect(await readWith(out, (doc) => doc.getFieldObjects())).toBeNull();
    const annotations = await annotationsOf(out);
    expect(annotations.map((a) => a.subtype)).toEqual(['Widget', 'Widget']);
  });

  it('LOSES tagging, the language and the structure tree', async () => {
    expect(await catalogKeys(fixture('tagged-2p.pdf'))).toEqual(
      expect.arrayContaining(['/MarkInfo', '/Lang', '/StructTreeRoot']),
    );
    const keys = await catalogKeys(await merged('tagged-2p.pdf', 2));
    for (const lost of ['/MarkInfo', '/Lang', '/StructTreeRoot']) expect(keys).not.toContain(lost);
  });

  it('KEEPS external links', async () => {
    const out = await merged('links-1p.pdf', 1);
    const annotations = await annotationsOf(out);
    expect(annotations.map((a) => a.url)).toEqual(['https://example.org/']);
  });

  it('KEEPS page text, so the output stays searchable', async () => {
    const out = await merged('mixed-sizes-3p.pdf', 3);
    const text = await readWith(out, async (doc) => {
      const content = await (await doc.getPage(2)).getTextContent();
      return content.items.map((item) => ('str' in item ? item.str : '')).join('');
    });
    expect(text).toBe('A-2');
  });

  it('does not recompress pictures: image bytes are copied as they are', async () => {
    const source = fixture('scanned-2p.pdf');
    const out = await merged('scanned-2p.pdf', 2);
    expect(out.byteLength).toBeGreaterThan(source.byteLength * 0.95);
    expect(out.byteLength).toBeLessThan(source.byteLength * 1.05);
  });
});
