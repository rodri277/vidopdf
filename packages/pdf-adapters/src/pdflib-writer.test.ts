import { describe, expect, it, vi } from 'vitest';
import type { ExportPage } from '@vidopdf/core';
import { fixture } from './testing/fixtures';
import { readPages } from './testing/pdf-text';
import { qpdfCheck } from './testing/qpdf';
import { createPdfLibWriter } from './pdflib-writer';

const writer = createPdfLibWriter();
const sources = new Map([
  ['a', fixture('mixed-sizes-3p.pdf')],
  ['b', fixture('rotated-2p.pdf')],
  ['c', fixture('single-1p.pdf')],
]);

describe('inspect', () => {
  it('counts the pages of a valid PDF', async () => {
    expect(await writer.inspect(fixture('mixed-sizes-3p.pdf'))).toEqual({
      ok: true,
      value: { pageCount: 3 },
    });
  });

  it.each([
    ['zero-bytes.pdf', 'empty'],
    ['not-a-pdf.pdf', 'corrupt'],
    ['truncated.pdf', 'corrupt'],
    ['encrypted-owner-restricted.pdf', 'encrypted'],
    ['encrypted-user-password.pdf', 'encrypted'],
  ])('rejects %s as %s without throwing', async (name, kind) => {
    const result = await writer.inspect(fixture(name));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe(kind);
  });
});

describe('assemble', () => {
  const pages: ExportPage[] = [
    { kind: 'original', sourceId: 'b', pageIndex: 1, rotation: 0 },
    { kind: 'original', sourceId: 'a', pageIndex: 2, rotation: 0 },
    { kind: 'original', sourceId: 'c', pageIndex: 0, rotation: 90 },
    { kind: 'original', sourceId: 'a', pageIndex: 0, rotation: 0 },
  ];

  it('builds one PDF with the requested pages in the requested order', async () => {
    const result = await writer.assemble(sources, pages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = await readPages(result.value);
    expect(out.map((p) => p.text)).toEqual(['B-2', 'A-3', 'C-1', 'A-1']);
    expect(out.map((p) => [p.width, p.height])).toEqual([
      [595, 842],
      [400, 300],
      [612, 792],
      [595, 842],
    ]);
  });

  it('adds the requested rotation on top of the one the page already has', async () => {
    const result = await writer.assemble(sources, pages);
    if (!result.ok) throw new Error('assemble failed');
    const out = await readPages(result.value);
    // B-2 is already rotated 90; C-1 gets +90; the others stay at 0.
    expect(out.map((p) => p.rotate)).toEqual([90, 0, 90, 0]);
  });

  it('keeps the sum of rotations between 0 and 270, whatever the source says', async () => {
    const { PDFDocument, degrees } = await import('@cantoo/pdf-lib');
    const odd = await PDFDocument.create();
    odd.addPage([200, 300]).setRotation(degrees(-90));
    odd.addPage([200, 300]).setRotation(degrees(450));
    const result = await writer.assemble(new Map([['o', await odd.save()]]), [
      { kind: 'original', sourceId: 'o', pageIndex: 0, rotation: 0 },
      { kind: 'original', sourceId: 'o', pageIndex: 1, rotation: 270 },
    ]);
    if (!result.ok) throw new Error('assemble failed');
    expect((await readPages(result.value)).map((p) => p.rotate)).toEqual([270, 0]);
  });

  it('produces a file that qpdf --check accepts', async () => {
    const result = await writer.assemble(sources, pages);
    if (!result.ok) throw new Error('assemble failed');
    expect(() => {
      qpdfCheck(result.value);
    }).not.toThrow();
  });

  it('does not modify the source bytes', async () => {
    const before = new Uint8Array(sources.get('a') ?? []);
    await writer.assemble(sources, pages);
    expect(sources.get('a')).toEqual(before);
  });

  it('fails when a source is damaged, naming no exception', async () => {
    const bad = new Map(sources).set('a', fixture('truncated.pdf'));
    const result = await writer.assemble(bad, pages);
    expect(result.ok).toBe(false);
  });

  it('fails when a page index is out of range', async () => {
    const result = await writer.assemble(sources, [
      { kind: 'original', sourceId: 'c', pageIndex: 5, rotation: 0 },
    ]);
    expect(result).toMatchObject({ ok: false, error: { kind: 'internal' } });
  });

  it('fails on an unknown source and on an empty selection', async () => {
    expect(
      await writer.assemble(sources, [
        { kind: 'original', sourceId: 'zzz', pageIndex: 0, rotation: 0 },
      ]),
    ).toMatchObject({
      ok: false,
    });
    expect(await writer.assemble(sources, [])).toMatchObject({
      ok: false,
      error: { kind: 'empty' },
    });
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await writer.assemble(sources, pages, { signal: controller.signal })).toMatchObject({
      ok: false,
      error: { kind: 'cancelled' },
    });
  });

  it('adds blank pages of the requested size and rotation', async () => {
    const result = await writer.assemble(sources, [
      { kind: 'original', sourceId: 'c', pageIndex: 0, rotation: 0 },
      { kind: 'blank', width: 300, height: 200, rotation: 90 },
    ]);
    if (!result.ok) throw new Error('assemble failed');
    const out = await readPages(result.value);
    expect(out.map((p) => [p.text, p.width, p.height, p.rotate])).toEqual([
      ['C-1', 612, 792, 0],
      ['', 300, 200, 90],
    ]);
  });

  it('can build a document made only of blank pages, without any source', async () => {
    const result = await writer.assemble(new Map(), [
      { kind: 'blank', width: 100, height: 100, rotation: 0 },
    ]);
    expect(result.ok).toBe(true);
  });

  it('reports progress after every page', async () => {
    const calls: [number, number][] = [];
    await writer.assemble(sources, pages, {
      onProgress: (done, total) => calls.push([done, total]),
    });
    expect(calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('merges 300 pages in reverse order into a file qpdf accepts, in a few seconds', async () => {
    const big = new Map([['big', fixture('pages-300.pdf')]]);
    const reversed: ExportPage[] = Array.from({ length: 300 }, (_, i) => ({
      kind: 'original',
      sourceId: 'big',
      pageIndex: 299 - i,
      rotation: 0,
    }));
    const started = performance.now();
    const result = await writer.assemble(big, reversed);
    const elapsed = performance.now() - started;
    if (!result.ok) throw new Error('assemble failed');
    expect(elapsed).toBeLessThan(5000);
    const out = await readPages(result.value);
    expect(out).toHaveLength(300);
    expect(out[0]?.text).toBe('PAGE 300');
    expect(out[299]?.text).toBe('PAGE 1');
    expect(() => {
      qpdfCheck(result.value);
    }).not.toThrow();
  });

  it('parses each source once, however many times pages are built from it', async () => {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const fresh = new Map([['x', new Uint8Array(fixture('mixed-sizes-3p.pdf'))]]); // bytes this run has not seen
    const load = vi.spyOn(PDFDocument, 'load');
    try {
      const page = [
        { kind: 'original' as const, sourceId: 'x', pageIndex: 0, rotation: 0 as const },
      ];
      for (let run = 0; run < 5; run++) expect((await writer.assemble(fresh, page)).ok).toBe(true);
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      load.mockRestore();
    }
  });
});
