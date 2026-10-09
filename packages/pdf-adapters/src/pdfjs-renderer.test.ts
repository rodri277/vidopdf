import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_CANVAS_PIXELS } from '@vidopdf/core';
import type { ImageExportOptions, PdfRenderer } from '@vidopdf/core';
import { canEncodeImage, createPdfjsRenderer, encodeBlankImage } from './pdfjs-renderer';
import { decode, napiCanvas, near } from './testing/canvas';
import { fixture } from './testing/fixtures';
import { nodeAssets, nodeDocumentOptions, nodePdfjs } from './testing/pdfjs-node';

const opened: PdfRenderer<ImageBitmap>[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

async function open(bytes: Uint8Array, encodes?: readonly string[], bitmaps = false) {
  const canvases = napiCanvas(encodes);
  const renderer = createPdfjsRenderer(nodeAssets, {
    pdfjs: nodePdfjs,
    // Thumbnails are ImageBitmaps, which only a browser makes: a stand-in is enough to see the sizes.
    createCanvas: bitmaps
      ? (width, height) => ({
          ...canvases(width, height),
          transferToImageBitmap: () => ({ close: () => undefined }) as unknown as ImageBitmap,
        })
      : canvases,
    documentOptions: nodeDocumentOptions,
  });
  opened.push(renderer);
  const result = await renderer.open(bytes);
  if (!result.ok) throw new Error(`open failed: ${result.error.kind}`);
  return { renderer, pageCount: result.value.pageCount };
}

const image = (changes: Partial<ImageExportOptions> = {}): ImageExportOptions => ({
  format: 'png',
  dpi: 72,
  quality: 0.9,
  ...changes,
});

async function render(
  renderer: PdfRenderer<ImageBitmap>,
  pageIndex: number,
  options: ImageExportOptions,
) {
  const result = await renderer.renderImage(pageIndex, options);
  if (!result.ok)
    throw new Error(`renderImage failed: ${result.error.kind} ${result.error.detail ?? ''}`);
  return result.value;
}

describe('renderImage', () => {
  it('draws an A4 page at 72 dpi as a 595 x 842 PNG with a white paper background', async () => {
    const { renderer } = await open(fixture('mixed-sizes-3p.pdf'));
    const encoded = await render(renderer, 0, image());
    expect([encoded.width, encoded.height, encoded.dpi, encoded.capped]).toEqual([
      595,
      842,
      72,
      false,
    ]);
    expect([...encoded.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const pixels = await decode(encoded.bytes);
    expect([pixels.width, pixels.height]).toEqual([595, 842]);
    expect(pixels.at(5, 5)).toEqual([255, 255, 255, 255]); // outside the blue panel: opaque white, not transparent
    expect(near(pixels.at(300, 300), [230, 237, 255], 4)).toBe(true); // inside the panel
  });

  it('scales with the resolution', async () => {
    const { renderer } = await open(fixture('mixed-sizes-3p.pdf'));
    const at150 = await render(renderer, 0, image({ dpi: 150 }));
    expect([at150.width, at150.height]).toEqual([1240, 1754]);
    const at300 = await render(renderer, 0, image({ dpi: 300 }));
    expect([at300.width, at300.height]).toEqual([2479, 3508]);
  });

  it('follows the size and rotation of each page', async () => {
    const { renderer } = await open(fixture('mixed-sizes-3p.pdf'));
    const landscape = await render(renderer, 2, image());
    expect([landscape.width, landscape.height]).toEqual([400, 300]);
    const rotated = await open(fixture('rotated-2p.pdf'));
    const turned = await render(rotated.renderer, 1, image()); // /Rotate 90 on an A4 page
    expect([turned.width, turned.height]).toEqual([842, 595]);
  });

  it('encodes JPEG and WebP with their own signatures, and the pixels survive', async () => {
    const { renderer } = await open(fixture('mixed-sizes-3p.pdf'));
    const jpeg = await render(renderer, 0, image({ format: 'jpeg', quality: 0.95 }));
    expect([...jpeg.bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const webp = await render(renderer, 0, image({ format: 'webp' }));
    expect(new TextDecoder().decode(webp.bytes.slice(8, 12))).toBe('WEBP');
    for (const encoded of [jpeg, webp]) {
      const pixels = await decode(encoded.bytes);
      expect(near(pixels.at(5, 5), [255, 255, 255], 6)).toBe(true);
      expect(near(pixels.at(300, 300), [230, 237, 255], 10)).toBe(true);
    }
  });

  it('a lower quality makes a smaller JPEG', async () => {
    const { renderer } = await open(fixture('scanned-2p.pdf'));
    const high = await render(renderer, 0, image({ format: 'jpeg', quality: 1, dpi: 100 }));
    const low = await render(renderer, 0, image({ format: 'jpeg', quality: 0.5, dpi: 100 }));
    expect(low.bytes.byteLength).toBeLessThan(high.bytes.byteLength);
  });

  it('lowers the resolution of a page too large for the canvas budget and says so', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([5000, 5000]); // 5000 pt at 300 dpi would be 20833 px a side
    const { renderer } = await open(await doc.save());
    const encoded = await render(renderer, 0, image({ dpi: 300 }));
    expect(encoded.capped).toBe(true);
    expect(encoded.dpi).toBeLessThan(300);
    expect(encoded.width * encoded.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect((await decode(encoded.bytes)).width).toBe(encoded.width);
  });

  it('refuses a format the browser cannot encode instead of handing back another one', async () => {
    const { renderer } = await open(fixture('single-1p.pdf'), ['image/png', 'image/jpeg']);
    const result = await renderer.renderImage(0, image({ format: 'webp' }));
    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
  });

  it('reports a cancelled render, a missing page and a closed document as errors, not exceptions', async () => {
    const { renderer } = await open(fixture('single-1p.pdf'));
    const controller = new AbortController();
    controller.abort();
    expect(await renderer.renderImage(0, image(), controller.signal)).toMatchObject({
      ok: false,
      error: { kind: 'cancelled' },
    });
    expect(await renderer.renderImage(9, image())).toMatchObject({ ok: false });
    await renderer.close();
    expect(await renderer.renderImage(0, image())).toMatchObject({
      ok: false,
      error: { kind: 'internal' },
    });
  });
});

describe('open and ownership', () => {
  function spyingPdfjs() {
    const seen: { data?: unknown }[] = [];
    const pdfjs = {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: (source: Record<string, unknown>) => {
        seen.push(source);
        return { promise: Promise.resolve({ numPages: 1 }), destroy: () => Promise.resolve() };
      },
    };
    return { seen, pdfjs: pdfjs as unknown as typeof nodePdfjs };
  }

  it('copies the bytes by default, because pdf.js moves its buffer away from the caller', async () => {
    const { seen, pdfjs } = spyingPdfjs();
    const bytes = new Uint8Array([1, 2, 3]);
    await createPdfjsRenderer(nodeAssets, { pdfjs }).open(bytes);
    expect(seen[0]?.data).not.toBe(bytes);
    expect(seen[0]?.data).toEqual(bytes);
  });

  it('hands the very same bytes over when the caller gives them away, saving a copy of the file', async () => {
    const { seen, pdfjs } = spyingPdfjs();
    const bytes = new Uint8Array([1, 2, 3]);
    await createPdfjsRenderer(nodeAssets, { pdfjs }).open(bytes, { takeOwnership: true });
    expect(seen[0]?.data).toBe(bytes);
  });
});

describe('trim', () => {
  it('lets go of cached pages without stopping later renders', async () => {
    const { renderer } = await open(fixture('mixed-sizes-3p.pdf'));
    const before = await render(renderer, 0, image());
    await renderer.trim();
    const after = await render(renderer, 0, image());
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    expect(after.bytes).toEqual(before.bytes);
    await renderer.close();
    await expect(renderer.trim()).resolves.toBeUndefined();
  });

  it('does not fail when pdf.js refuses because a page is still being drawn', async () => {
    const pdfjs = {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          cleanup: () => Promise.reject(new Error('startCleanup: Page 1 is currently rendering.')),
        }),
        destroy: () => Promise.resolve(),
      }),
    } as unknown as typeof nodePdfjs;
    const renderer = createPdfjsRenderer(nodeAssets, { pdfjs });
    await renderer.open(new Uint8Array([1]));
    await expect(renderer.trim()).resolves.toBeUndefined();
  });
});

describe('rotation', () => {
  it('turns the picture by the quarter turn the user added, on top of the page own rotation', async () => {
    const { renderer } = await open(fixture('mixed-sizes-3p.pdf'));
    const plain = await render(renderer, 0, image());
    expect([plain.width, plain.height]).toEqual([595, 842]);
    const turned = await renderer.renderImage(0, image(), undefined, 90);
    expect(turned.ok && [turned.value.width, turned.value.height]).toEqual([842, 595]);
    const half = await renderer.renderImage(0, image(), undefined, 180);
    expect(half.ok && [half.value.width, half.value.height]).toEqual([595, 842]);

    const rotated = await open(fixture('rotated-2p.pdf')); // page 2 already has /Rotate 90
    const back = await rotated.renderer.renderImage(1, image(), undefined, 270); // 90 + 270 = upright again
    expect(back.ok && [back.value.width, back.value.height]).toEqual([595, 842]);
  });

  it('actually moves the content: the top-left of a turned page shows what was at its bottom-left', async () => {
    const { renderer } = await open(fixture('images-2p.pdf'));
    const plain = await decode((await render(renderer, 0, image())).bytes);
    const result = await renderer.renderImage(0, image(), undefined, 90);
    if (!result.ok) throw new Error('render failed');
    const turned = await decode(result.value.bytes);
    // Quarter turn clockwise: turned (x, y) shows plain (y, height - 1 - x).
    for (const [x, y] of [
      [100, 100],
      [700, 300],
      [50, 500],
    ] as const) {
      const [r, g, b] = plain.at(y, plain.height - 1 - x);
      expect(near(turned.at(x, y), [r, g, b], 12)).toBe(true);
    }
  });
});

describe('encodeBlankImage', () => {
  it('makes white paper of the page size at the resolution asked, swapping for a quarter turn', async () => {
    const flat = await encodeBlankImage(595, 842, 0, image({ dpi: 144 }), napiCanvas());
    expect(flat.ok && [flat.value.width, flat.value.height, flat.value.capped]).toEqual([
      1190,
      1684,
      false,
    ]);
    const sideways = await encodeBlankImage(595, 842, 90, image(), napiCanvas());
    if (!sideways.ok) throw new Error('blank failed');
    expect([sideways.value.width, sideways.value.height]).toEqual([842, 595]);
    expect((await decode(sideways.value.bytes)).at(10, 10)).toEqual([255, 255, 255, 255]);
  });

  it('says so when the page is too large, and when the format cannot be encoded', async () => {
    const huge = await encodeBlankImage(9000, 9000, 0, image({ dpi: 300 }), napiCanvas());
    expect(huge.ok && huge.value.capped).toBe(true);
    const nope = await encodeBlankImage(
      100,
      100,
      0,
      image({ format: 'webp' }),
      napiCanvas(['image/png']),
    );
    expect(nope).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
    const broken = await encodeBlankImage(100, 100, 0, image(), () => {
      throw new Error('no canvas');
    });
    expect(broken).toMatchObject({ ok: false });
  });
});

describe('opening documents', () => {
  it('rejects damaged and password-protected files as results', async () => {
    const renderer = createPdfjsRenderer(nodeAssets, {
      pdfjs: nodePdfjs,
      documentOptions: nodeDocumentOptions,
    });
    opened.push(renderer);
    expect(await renderer.open(fixture('truncated.pdf'))).toMatchObject({
      ok: false,
      error: { kind: 'corrupt' },
    });
    expect(await renderer.open(fixture('encrypted-user-password.pdf'))).toMatchObject({
      ok: false,
      error: { kind: 'encrypted' },
    });
    expect(await renderer.open(fixture('zero-bytes.pdf'))).toMatchObject({ ok: false });
  });
});

describe('outline', () => {
  it('reads the bookmarks of the open document', async () => {
    const { renderer } = await open(fixture('bookmarks-nested-6p.pdf'));
    const result = await renderer.outline();
    expect(result.ok && result.value.map((entry) => entry.title)).toEqual([
      'Part A',
      'A.1',
      'A.2',
      'Part B',
      'B.1',
      'Part C',
    ]);
  });

  it('is an error, not a crash, when nothing is open', async () => {
    const renderer = createPdfjsRenderer(nodeAssets, { pdfjs: nodePdfjs });
    expect(await renderer.outline()).toMatchObject({ ok: false, error: { kind: 'internal' } });
  });
});

describe('canEncodeImage', () => {
  it('reports what the canvas can really produce', async () => {
    expect(await canEncodeImage('png', napiCanvas())).toBe(true);
    expect(await canEncodeImage('webp', napiCanvas())).toBe(true);
    expect(await canEncodeImage('webp', napiCanvas(['image/png']))).toBe(false);
    expect(
      await canEncodeImage('jpeg', () => {
        throw new Error('no canvas');
      }),
    ).toBe(false);
  });
});

describe('renderPage reports the size of the page in points', () => {
  it('as the file shows it, so stamps can be placed with real margins', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const sideways = doc.addPage([400, 600]);
    sideways.setRotation(degrees(90));
    const { renderer } = await open(await doc.save(), undefined, true);
    const first = await renderer.renderPage(0, 100);
    const second = await renderer.renderPage(1, 100);
    expect(first.ok && [first.value.pointsWidth, first.value.pointsHeight]).toEqual([400, 600]);
    expect(second.ok && [second.value.pointsWidth, second.value.pointsHeight]).toEqual([600, 400]);
  });
});
