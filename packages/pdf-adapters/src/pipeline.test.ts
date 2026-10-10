import { describe, expect, it } from 'vitest';
import {
  bookmarksFromOutline,
  defaultImagePageOptions,
  emptyWorkspace,
  buildSplitPlan,
  splitByBookmarks,
  splitBySize,
  splitEveryN,
} from '@vidopdf/core';
import type { ExportPage, PageRef, PdfRenderer } from '@vidopdf/core';
import { unzipSync } from 'fflate';
import { createPdfLibWriter } from './pdflib-writer';
import { createPdfjsRenderer } from './pdfjs-renderer';
import { createZipBuilder } from './zip';
import { decode, napiCanvas, near, quadrantImage, COLORS } from './testing/canvas';
import { fixture } from './testing/fixtures';
import { nodeAssets, nodeDocumentOptions, nodePdfjs } from './testing/pdfjs-node';
import { readPages } from './testing/pdf-text';
import { qpdfCheck } from './testing/qpdf';
import { differingPixels, renderPage } from './testing/render';

const writer = createPdfLibWriter();

function pagesOf(sourceId: string, count: number): PageRef[] {
  return Array.from({ length: count }, (_, sourceIndex) => ({
    kind: 'original' as const,
    id: `${sourceId}-${String(sourceIndex)}`,
    sourceId,
    sourceIndex,
    rotation: 0 as const,
  }));
}

const toExport = (page: PageRef): ExportPage =>
  page.kind === 'original'
    ? {
        kind: 'original',
        sourceId: page.sourceId,
        pageIndex: page.sourceIndex,
        rotation: page.rotation,
      }
    : { kind: 'blank', width: page.width, height: page.height, rotation: page.rotation };

async function build(
  sources: ReadonlyMap<string, Uint8Array>,
  pages: readonly PageRef[],
): Promise<Uint8Array> {
  const result = await writer.assemble(sources, pages.map(toExport));
  if (!result.ok) throw new Error(`assemble failed: ${result.error.kind}`);
  return result.value;
}

async function openRenderer(bytes: Uint8Array): Promise<PdfRenderer<ImageBitmap>> {
  const renderer = createPdfjsRenderer(nodeAssets, {
    pdfjs: nodePdfjs,
    createCanvas: napiCanvas(),
    documentOptions: nodeDocumentOptions,
  });
  const opened = await renderer.open(bytes);
  if (!opened.ok) throw new Error('open failed');
  return renderer;
}

describe('split by size with the real writer', () => {
  const sources = new Map([['big', fixture('pages-300.pdf')]]);

  it('keeps every file within the limit, loses no page, and each file is a valid PDF', async () => {
    const pages = pagesOf('big', 300);
    const limit = 40_000;
    const result = await splitBySize(
      pages,
      limit,
      async (group) => (await build(sources, group)).byteLength,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.length).toBeGreaterThan(2);
    expect(result.value.flatMap((g) => g.pages)).toEqual(pages);
    for (const group of result.value) {
      const bytes = await build(sources, group.pages);
      expect(bytes.byteLength).toBeLessThanOrEqual(limit);
      expect(bytes.byteLength).toBe(group.size);
      qpdfCheck(bytes);
    }
  });

  it('explains which page is too large when one cannot fit', async () => {
    const scans = new Map([['scan', fixture('scanned-2p.pdf')]]);
    const result = await splitBySize(
      pagesOf('scan', 2),
      20_000,
      async (group) => (await build(scans, group)).byteLength,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'pageTooLarge', pageNumber: 1, limit: 20_000 },
    });
  });

  it('measures a few dozen times for 300 pages, not hundreds, thanks to bisecting and the parse cache', async () => {
    let measurements = 0;
    const started = performance.now();
    await splitBySize(pagesOf('big', 300), 60_000, async (group) => {
      measurements++;
      return (await build(sources, group)).byteLength;
    });
    expect(measurements).toBeLessThan(60);
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});

describe('split by bookmarks from a real outline', () => {
  it('reads the outline, cuts at the top-level entries and writes one valid PDF per chapter', async () => {
    const bytes = fixture('bookmarks-nested-6p.pdf');
    const renderer = await openRenderer(bytes);
    const outline = await renderer.outline();
    await renderer.close();
    if (!outline.ok) throw new Error('outline failed');

    const pages = pagesOf('nb', 6);
    const groups = splitByBookmarks(pages, bookmarksFromOutline('nb', outline.value));
    if (!groups.ok) throw new Error('split failed');
    expect(groups.value.map((g) => [g.title, g.pages.length])).toEqual([
      ['Part A', 3],
      ['Part B', 2],
      ['Part C', 1],
    ]);
    const plan = buildSplitPlan(emptyWorkspace, groups.value, 'book');
    expect(plan.outputs.map((o) => o.name)).toEqual([
      'book - Part A.pdf',
      'book - Part B.pdf',
      'book - Part C.pdf',
    ]);

    for (const [index, group] of groups.value.entries()) {
      const out = await build(new Map([['nb', bytes]]), group.pages);
      qpdfCheck(out);
      const text = (await readPages(out)).map((p) => p.text);
      expect(text).toEqual(
        group.pages.map((p) => `NB-${String(p.kind === 'original' ? p.sourceIndex + 1 : 0)}`),
      );
      expect(text.length).toBe([3, 2, 1][index]);
    }
  });

  it('with levels 1 and 2 there is a file per bookmark of either level', async () => {
    const renderer = await openRenderer(fixture('bookmarks-nested-6p.pdf'));
    const outline = await renderer.outline();
    await renderer.close();
    if (!outline.ok) throw new Error('outline failed');
    const groups = splitByBookmarks(pagesOf('nb', 6), bookmarksFromOutline('nb', outline.value, 2));
    expect(groups.ok && groups.value.map((g) => g.pages.length)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('split into a ZIP', () => {
  it('packs every part into one archive that unpacks to valid PDFs with the right pages', async () => {
    const sources = new Map([
      ['a', fixture('mixed-sizes-3p.pdf')],
      ['b', fixture('rotated-2p.pdf')],
    ]);
    const pages = [...pagesOf('a', 3), ...pagesOf('b', 2)];
    const groups = splitEveryN(pages, 2);
    if (!groups.ok) throw new Error('split failed');
    const plan = buildSplitPlan(emptyWorkspace, groups.value, 'combo');
    const zip = createZipBuilder();
    for (const [index, output] of plan.outputs.entries()) {
      const group = groups.value[index];
      if (group === undefined) throw new Error('missing group');
      const added = zip.add(output.name, await build(sources, group.pages), { deflate: true });
      if (!added.ok) throw new Error('zip add failed');
    }
    const done = zip.finish();
    if (!done.ok) throw new Error('zip finish failed');
    const files = unzipSync(done.value);
    expect(Object.keys(files)).toEqual(['combo_1.pdf', 'combo_2.pdf', 'combo_3.pdf']);
    const labels: string[][] = [];
    for (const bytes of Object.values(files)) {
      qpdfCheck(bytes);
      labels.push((await readPages(bytes)).map((p) => p.text));
    }
    expect(labels).toEqual([['A-1', 'A-2'], ['A-3', 'B-1'], ['B-2']]);
  });
});

describe('PDF to images and back', () => {
  it('exports every page as a PNG whose pixels match the page, packed in a ZIP', async () => {
    const bytes = fixture('mixed-sizes-3p.pdf');
    const renderer = await openRenderer(bytes);
    const zip = createZipBuilder();
    for (let index = 0; index < 3; index++) {
      const encoded = await renderer.renderImage(index, { format: 'png', dpi: 72, quality: 0.9 });
      if (!encoded.ok) throw new Error('renderImage failed');
      zip.add(`doc-${String(index + 1)}.png`, encoded.value.bytes);
    }
    await renderer.close();
    const done = zip.finish();
    if (!done.ok) throw new Error('zip failed');
    const files = unzipSync(done.value);
    expect(Object.keys(files)).toEqual(['doc-1.png', 'doc-2.png', 'doc-3.png']);
    const second = await decode(files['doc-2.png'] ?? new Uint8Array());
    expect([second.width, second.height]).toEqual([612, 792]); // Letter
  });

  it('an image made into a PDF and merged with a PDF page renders like the original picture', async () => {
    const picture = quadrantImage(300, 200, 'png');
    const made = await writer.fromImage(picture, {
      ...defaultImagePageOptions,
      paper: 'fit',
      orientation: 'auto',
      margin: 'none',
    });
    if (!made.ok) throw new Error('fromImage failed');
    const sources = new Map([
      ['img', made.value],
      ['doc', fixture('single-1p.pdf')],
    ]);
    const merged = await build(sources, [...pagesOf('doc', 1), ...pagesOf('img', 1)]);
    qpdfCheck(merged);
    const first = await renderPage(merged, 2, { scale: 1 });
    const direct = await renderPage(made.value, 1, { scale: 1 });
    expect(differingPixels(first, direct)).toBeLessThanOrEqual(0.0001);
    const at = (fx: number, fy: number) => {
      const offset =
        (Math.floor(first.height * fy) * first.width + Math.floor(first.width * fx)) * 4;
      return [first.data[offset] ?? 0, first.data[offset + 1] ?? 0, first.data[offset + 2] ?? 0];
    };
    expect(near(at(0.1, 0.1), COLORS.red)).toBe(true);
    expect(near(at(0.9, 0.9), COLORS.yellow)).toBe(true);
  });
});
