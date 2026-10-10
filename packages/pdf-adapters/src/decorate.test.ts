import { PDFDocument } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { NO_METADATA, presets } from '@vidopdf/core';
import type { Anchor, Decorations, ExportPage, Rotation, Stamp, TextStamp } from '@vidopdf/core';
import { createPdfLibWriter } from './pdflib-writer';
import { renderPage } from './testing';
import type { Raster } from './testing';
import { nodeFonts } from './testing/fonts';
import { qpdfCheck } from './testing/qpdf';

const writer = createPdfLibWriter({ fonts: nodeFonts });
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

const decorations = (changes: Partial<Decorations> = {}): Decorations => ({
  stamps: [],
  fileName: 'out.pdf',
  date: '2026-10-09',
  metadata: NO_METADATA,
  bookmarks: [],
  forms: {},
  formMode: 'keep',
  ...changes,
});

const blank = (rotation: Rotation = 0): ExportPage => ({
  kind: 'blank',
  width: 595,
  height: 842,
  rotation,
});

async function build(
  pages: readonly ExportPage[],
  changes: Partial<Decorations>,
  assets = new Map<string, Uint8Array>(),
) {
  const result = await writer.assemble(new Map(), pages, {
    decorations: decorations(changes),
    assets,
  });
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.detail ?? ''}`);
  qpdfCheck(result.value);
  return result.value;
}

interface Ink {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly count: number;
}

/** Where the pixels that match `isInk` are, as fractions of the picture. */
function ink(raster: Raster, isInk: (r: number, g: number, b: number) => boolean): Ink | undefined {
  let [left, top, right, bottom, count] = [raster.width, raster.height, -1, -1, 0];
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const at = (y * raster.width + x) * 4;
      if (!isInk(raster.data[at] ?? 255, raster.data[at + 1] ?? 255, raster.data[at + 2] ?? 255))
        continue;
      [left, top, right, bottom, count] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
        count + 1,
      ];
    }
  }
  return count === 0
    ? undefined
    : {
        left: left / raster.width,
        top: top / raster.height,
        right: (right + 1) / raster.width,
        bottom: (bottom + 1) / raster.height,
        count,
      };
}

const dark = (r: number, g: number, b: number) => r < 140 && g < 140 && b < 140;
const red = (r: number, g: number, b: number) => r > 200 && g < 90 && b < 90;

function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

const center = (box: Ink) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

const text = (anchor: Anchor, changes: Partial<TextStamp> = {}): TextStamp => ({
  ...presets.pageNumber('t'),
  template: 'Stamp 123',
  anchor,
  fontSize: 28,
  margin: 24,
  color: '#000000',
  ...changes,
});

describe('stamps land where the reader sees them, upright, for every page rotation', () => {
  const expected: Record<string, { x: [number, number]; y: [number, number] }> = {
    topLeft: { x: [0, 0.4], y: [0, 0.2] },
    bottomRight: { x: [0.55, 1], y: [0.8, 1] },
    center: { x: [0.3, 0.7], y: [0.4, 0.6] },
  };

  for (const rotation of ROTATIONS) {
    for (const anchor of ['topLeft', 'bottomRight', 'center'] as const) {
      it(`${anchor} on a page turned ${String(rotation)}`, async () => {
        const pdf = await build([blank(rotation)], { stamps: [text(anchor)] });
        const found = ink(await renderPage(pdf, 1, { scale: 1 }), dark);
        if (found === undefined) throw new Error('nothing was drawn');
        const middle = center(found);
        const want = expected[anchor] ?? { x: [0, 1], y: [0, 1] };
        expect(middle.x).toBeGreaterThan(want.x[0]);
        expect(middle.x).toBeLessThan(want.x[1]);
        expect(middle.y).toBeGreaterThan(want.y[0]);
        expect(middle.y).toBeLessThan(want.y[1]);
        // Upright: a line of text is much wider than it is tall, as the reader sees it.
        const view = await renderPage(pdf, 1, { scale: 1 });
        expect((found.right - found.left) * view.width).toBeGreaterThan(
          2 * (found.bottom - found.top) * view.height,
        );
      });
    }
  }
});

describe('page numbers', () => {
  it('number the pages of the output, leave out the cover and use Roman numerals when asked', async () => {
    const stamp = text('bottomCenter', {
      template: '{n:roman} / {total}',
      skipFirst: true,
    });
    const pdf = await build([blank(), blank(), blank()], { stamps: [stamp] });
    const inks = await Promise.all(
      [1, 2, 3].map(async (n) => ink(await renderPage(pdf, n, { scale: 1 }), dark)),
    );
    expect(inks[0]).toBeUndefined();
    expect(inks[1]).toBeDefined();
    expect(inks[2]).toBeDefined();
  });

  it('start at the number given', async () => {
    const stamp = text('bottomCenter', { template: '{n}', startAt: 10000 });
    const pdf = await build([blank()], { stamps: [stamp] });
    const wide = ink(await renderPage(pdf, 1, { scale: 1 }), dark);
    const narrow = ink(
      await renderPage(
        await build([blank()], { stamps: [text('bottomCenter', { template: '{n}' })] }),
        1,
        { scale: 1 },
      ),
      dark,
    );
    // Five digits are wider than one.
    expect((wide?.right ?? 0) - (wide?.left ?? 0)).toBeGreaterThan(
      ((narrow?.right ?? 0) - (narrow?.left ?? 0)) * 3,
    );
  });
});

describe('text in other scripts', () => {
  it('sets Cyrillic and Greek with digits and punctuation from the other files', async () => {
    const stamp = text('center', { template: 'Страница 3 из 10 · Σελίδα 3 από 10' });
    const pdf = await build([blank()], { stamps: [stamp] });
    expect(ink(await renderPage(pdf, 1, { scale: 1 }), dark)).toBeDefined();
  });

  it('refuses characters no file has, and names them, instead of drawing boxes', async () => {
    const result = await writer.assemble(new Map(), [blank()], {
      decorations: decorations({ stamps: [text('center', { template: 'Hello 你好' })] }),
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
    if (!result.ok) expect(result.error.detail).toContain('你');
  });
});

describe('watermarks', () => {
  it('a turned, translucent watermark sits in the middle and is lighter than solid text', async () => {
    const mark = { ...presets.watermark('w', 'DRAFT'), opacity: 0.2, color: '#000000' };
    const pdf = await build([blank()], { stamps: [mark] });
    const view = await renderPage(pdf, 1, { scale: 1 });
    const found = ink(view, (r, g, b) => r < 235 && g < 235 && b < 235);
    if (found === undefined) throw new Error('nothing was drawn');
    expect(Math.abs(center(found).x - 0.5)).toBeLessThan(0.08);
    expect(Math.abs(center(found).y - 0.5)).toBeLessThan(0.08);
    expect(ink(view, dark)).toBeUndefined(); // 20 % opacity never gets dark
  });

  it('a picture watermark and a signature use the pictures given, once each in the file', async () => {
    const canvas = createCanvas(40, 20);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 40, 20);
    const assets = new Map([['logo', new Uint8Array(canvas.toBuffer('image/png'))]]);
    const stamp: Stamp = {
      kind: 'image',
      id: 'i',
      assetId: 'logo',
      anchor: 'topRight',
      margin: 30,
      opacity: 1,
      rotation: 0,
      pages: { kind: 'all' },
      skipFirst: false,
      width: 120,
      aspect: 0.5,
    };
    const pdf = await build([blank(), blank()], { stamps: [stamp] }, assets);
    const found = ink(await renderPage(pdf, 1, { scale: 1 }), red);
    expect(center(need(found)).x).toBeGreaterThan(0.7);
    expect(center(need(found)).y).toBeLessThan(0.15);
    // Embedded once even though it is on two pages.
    expect(
      Buffer.from(pdf)
        .toString('latin1')
        .match(/\/Subtype\s*\/Image/g),
    ).toHaveLength(1);
  });

  it('refuses a picture that is missing', async () => {
    const stamp: Stamp = {
      kind: 'image',
      id: 'i',
      assetId: 'nope',
      anchor: 'center',
      margin: 0,
      opacity: 1,
      rotation: 0,
      pages: { kind: 'all' },
      skipFirst: false,
      width: 50,
      aspect: 1,
    };
    const result = await writer.assemble(new Map(), [blank()], {
      decorations: decorations({ stamps: [stamp] }),
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
  });
});

describe('signatures placed on a page', () => {
  const canvas = createCanvas(30, 30);
  canvas.getContext('2d').fillStyle = '#ff0000';
  canvas.getContext('2d').fillRect(0, 0, 30, 30);
  const assets = new Map([['sig', new Uint8Array(canvas.toBuffer('image/png'))]]);
  const overlay = { id: 'o', assetId: 'sig', x: 0.1, y: 0.7, width: 0.2, aspect: 1 };

  for (const rotation of ROTATIONS) {
    it(`appear at the place chosen as the reader sees it, on a page turned ${String(rotation)}`, async () => {
      const page: ExportPage = {
        kind: 'original',
        sourceId: 'x',
        pageIndex: 0,
        rotation,
        overlays: [overlay],
      };
      const base = await PDFDocument.create();
      base.addPage([595, 842]);
      const result = await writer.assemble(new Map([['x', await base.save()]]), [page], {
        decorations: decorations(),
        assets,
      });
      if (!result.ok) throw new Error(result.error.kind);
      qpdfCheck(result.value);
      const view = await renderPage(result.value, 1, { scale: 1 });
      const found = ink(view, red);
      if (found === undefined) throw new Error('no signature');
      // Display fractions of the rendered (turned) page: x 0.1 to 0.3, y 0.7 to 0.7 + width * W / H.
      const height = (0.2 * view.width * 1) / view.height;
      expect(found.left).toBeCloseTo(0.1, 1);
      expect(found.right).toBeCloseTo(0.3, 1);
      expect(found.top).toBeCloseTo(0.7, 1);
      expect(found.bottom).toBeCloseTo(0.7 + height, 1);
    });
  }
});

describe('cropping', () => {
  it('draws only what is left, with the margins as the reader sees them', async () => {
    const base = await PDFDocument.create();
    base.addPage([600, 800]);
    const sources = new Map([['x', await base.save()]]);
    for (const rotation of ROTATIONS) {
      const page: ExportPage = {
        kind: 'original',
        sourceId: 'x',
        pageIndex: 0,
        rotation,
        crop: { top: 0.1, right: 0.2, bottom: 0.0, left: 0.05 },
      };
      const result = await writer.assemble(sources, [page], { decorations: decorations() });
      if (!result.ok) throw new Error(result.error.kind);
      qpdfCheck(result.value);
      const view = await renderPage(result.value, 1, { scale: 1 });
      const full = rotation % 180 === 0 ? { w: 600, h: 800 } : { w: 800, h: 600 };
      expect(view.width).toBeCloseTo(full.w * (1 - 0.05 - 0.2), -0.5);
      expect(view.height).toBeCloseTo(full.h * (1 - 0.1), -0.5);
    }
  });

  it('keeps stamps inside the visible area', async () => {
    const base = await PDFDocument.create();
    base.addPage([600, 800]);
    const page: ExportPage = {
      kind: 'original',
      sourceId: 'x',
      pageIndex: 0,
      rotation: 0,
      crop: { top: 0.3, right: 0.3, bottom: 0.3, left: 0.3 },
    };
    const result = await writer.assemble(new Map([['x', await base.save()]]), [page], {
      decorations: decorations({ stamps: [text('bottomRight', { template: '99', margin: 10 })] }),
    });
    if (!result.ok) throw new Error(result.error.kind);
    const found = ink(await renderPage(result.value, 1, { scale: 1 }), dark);
    expect(found).toBeDefined();
    expect(found?.right).toBeLessThan(1);
    expect(found?.bottom).toBeGreaterThan(0.8);
  });
});

describe('metadata and bookmarks', () => {
  it('writes only what was given and adds nothing about the user or the tool', async () => {
    const pdf = await build([blank()], {
      metadata: { title: 'Report ñ', author: 'vidotho', subject: '', keywords: ['a', 'b'] },
    });
    // Loading would stamp the producer again, which is what the file must not carry.
    const doc = await PDFDocument.load(pdf, { updateMetadata: false });
    expect(doc.getTitle()).toBe('Report ñ');
    expect(doc.getAuthor()).toBe('vidotho');
    expect(doc.getSubject()).toBeUndefined();
    expect(doc.getKeywords()).toBe('a, b');
    expect(doc.getProducer()).toBeUndefined();
    expect(doc.getCreator()).toBeUndefined();
    expect(doc.getCreationDate()).toBeUndefined();
  });

  it('writes bookmarks pdf.js can read, nested, with Unicode titles and the right pages', async () => {
    const pdf = await build([blank(), blank(), blank()], {
      bookmarks: [
        { title: 'Intro — ñ', pageIndex: 0, children: [] },
        { title: 'Part', pageIndex: 1, children: [{ title: 'Child', pageIndex: 2, children: [] }] },
      ],
    });
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({
      data: pdf.slice(),
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
    }).promise;
    interface Item {
      title: string;
      items: Item[];
      dest: unknown[];
    }
    const outline = (await doc.getOutline()) as Item[] | null;
    expect(outline?.map((item) => [item.title, item.items.map((child) => child.title)])).toEqual([
      ['Intro — ñ', []],
      ['Part', ['Child']],
    ]);
    const destination = outline?.[1]?.items[0]?.dest;
    expect(await doc.getPageIndex(destination?.[0] as never)).toBe(2);
  });

  it('writes no outline when there are no bookmarks', async () => {
    const pdf = await build([blank()], {});
    expect(Buffer.from(pdf).toString('latin1')).not.toContain('/Outlines');
  });
});
