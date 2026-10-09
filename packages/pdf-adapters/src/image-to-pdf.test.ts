import { describe, expect, it } from 'vitest';
import { defaultImagePageOptions, jpegOrientation } from '@vidopdf/core';
import type { ImagePageOptions } from '@vidopdf/core';
import { createPdfLibWriter } from './pdflib-writer';
import { imageToPdf } from './image-to-pdf';
import { COLORS, near, quadrantImage, withOrientation } from './testing/canvas';
import { qpdfCheck } from './testing/qpdf';
import { readPages } from './testing/pdf-text';
import { renderPage } from './testing/render';
import { createCanvas } from '@napi-rs/canvas';

const fit: ImagePageOptions = { paper: 'fit', orientation: 'auto', margin: 'none' };

async function pdfOf(bytes: Uint8Array, options: ImagePageOptions = defaultImagePageOptions) {
  const result = await imageToPdf(bytes, options);
  if (!result.ok)
    throw new Error(`imageToPdf failed: ${result.error.kind} ${result.error.detail ?? ''}`);
  return result.value;
}

type Corner = 'TL' | 'TR' | 'BL' | 'BR';
type Name = keyof typeof COLORS;

/** Colour seen at each corner of the page after `orientation` is applied to the red/green/blue/yellow picture. */
const UPRIGHT: Record<number, Record<Corner, Name>> = {
  1: { TL: 'red', TR: 'green', BL: 'blue', BR: 'yellow' },
  2: { TL: 'green', TR: 'red', BL: 'yellow', BR: 'blue' },
  3: { TL: 'yellow', TR: 'blue', BL: 'green', BR: 'red' },
  4: { TL: 'blue', TR: 'yellow', BL: 'red', BR: 'green' },
  5: { TL: 'red', TR: 'blue', BL: 'green', BR: 'yellow' },
  6: { TL: 'blue', TR: 'red', BL: 'yellow', BR: 'green' },
  7: { TL: 'yellow', TR: 'green', BL: 'blue', BR: 'red' },
  8: { TL: 'green', TR: 'yellow', BL: 'red', BR: 'blue' },
};

async function cornerColors(pdf: Uint8Array) {
  const raster = await renderPage(pdf, 1, { scale: 1 });
  const at = (fx: number, fy: number) => {
    const offset =
      (Math.floor(raster.height * fy) * raster.width + Math.floor(raster.width * fx)) * 4;
    return [raster.data[offset] ?? 0, raster.data[offset + 1] ?? 0, raster.data[offset + 2] ?? 0];
  };
  return { raster, TL: at(0.1, 0.1), TR: at(0.9, 0.1), BL: at(0.1, 0.9), BR: at(0.9, 0.9) };
}

describe('imageToPdf', () => {
  it.each(['png', 'jpeg'] as const)(
    'turns a %s into a valid one-page PDF showing the picture',
    async (format) => {
      const pdf = await pdfOf(quadrantImage(400, 300, format), fit);
      expect(() => {
        qpdfCheck(pdf);
      }).not.toThrow();
      expect(await readPages(pdf)).toHaveLength(1);
      const seen = await cornerColors(pdf);
      expect(near(seen.TL, COLORS.red)).toBe(true);
      expect(near(seen.TR, COLORS.green)).toBe(true);
      expect(near(seen.BL, COLORS.blue)).toBe(true);
      expect(near(seen.BR, COLORS.yellow)).toBe(true);
    },
  );

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'shows a JPEG with EXIF orientation %i upright',
    async (orientation) => {
      const jpeg = withOrientation(quadrantImage(400, 200, 'jpeg'), orientation);
      expect(jpegOrientation(jpeg)).toBe(orientation);
      const pdf = await pdfOf(jpeg, fit);
      const seen = await cornerColors(pdf);
      for (const corner of ['TL', 'TR', 'BL', 'BR'] as const) {
        const expected = COLORS[UPRIGHT[orientation]?.[corner] ?? 'red'];
        expect(
          near(seen[corner], expected),
          `${corner} of orientation ${String(orientation)}`,
        ).toBe(true);
      }
      // Quarter turns trade width and height: a 400 x 200 picture ends up as a tall page.
      const tall = orientation >= 5;
      expect(seen.raster.width > seen.raster.height).toBe(!tall);
    },
  );

  it('lays a picture out on A4 within the margins, centred', async () => {
    const pdf = await pdfOf(quadrantImage(400, 300, 'png'), {
      paper: 'a4',
      orientation: 'auto',
      margin: 'large',
    });
    const [page] = await readPages(pdf);
    expect([page?.width, page?.height]).toEqual([842, 595]); // wide picture: landscape
    const raster = await renderPage(pdf, 1, { scale: 1 });
    const at = (x: number, y: number) => {
      const offset = (y * raster.width + x) * 4;
      return [raster.data[offset] ?? 0, raster.data[offset + 1] ?? 0, raster.data[offset + 2] ?? 0];
    };
    // The picture is 697 x 523 pt, centred: x from 72 to 769, y from 36 to 559.
    expect(near(at(20, 150), [255, 255, 255], 2)).toBe(true); // left margin
    expect(near(at(820, 150), [255, 255, 255], 2)).toBe(true); // right margin
    expect(near(at(100, 150), COLORS.red)).toBe(true); // just inside the picture, top left
    expect(near(at(740, 150), COLORS.green)).toBe(true); // top right
    expect(near(at(100, 520), COLORS.blue)).toBe(true); // bottom left
  });

  it('keeps transparency of a PNG', async () => {
    const canvas = createCanvas(100, 100);
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(220,30,30)';
    context.fillRect(0, 0, 50, 100); // left half red, right half fully transparent
    const pdf = await pdfOf(new Uint8Array(canvas.toBuffer('image/png')), fit);
    expect(new TextDecoder('latin1').decode(pdf)).toContain('/SMask');
    // pdf.js paints the page on white paper: the transparent half shows it, the opaque half is red.
    const raster = await renderPage(pdf, 1, { scale: 1 });
    const at = (fraction: number) => {
      const offset =
        (Math.floor(raster.height / 2) * raster.width + Math.floor(raster.width * fraction)) * 4;
      return [raster.data[offset] ?? 0, raster.data[offset + 1] ?? 0, raster.data[offset + 2] ?? 0];
    };
    expect(near(at(0.1), COLORS.red)).toBe(true);
    expect(near(at(0.9), [255, 255, 255], 2)).toBe(true);
  });

  it('accepts a grayscale JPEG', async () => {
    const canvas = createCanvas(120, 80);
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(90,90,90)';
    context.fillRect(0, 0, 120, 80);
    const pdf = await pdfOf(new Uint8Array(canvas.toBuffer('image/jpeg', 90)), fit);
    expect(() => {
      qpdfCheck(pdf);
    }).not.toThrow();
  });

  it('identifies the file by its bytes, so a wrong extension does not matter, and rejects what it cannot use', async () => {
    const webp = new Uint8Array(createCanvas(10, 10).toBuffer('image/webp'));
    expect(await imageToPdf(webp, fit)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported' },
    });
    expect(await imageToPdf(new TextEncoder().encode('GIF89a....'), fit)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported' },
    });
    expect(await imageToPdf(new TextEncoder().encode('just text'), fit)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported' },
    });
    expect(await imageToPdf(new Uint8Array(0), fit)).toMatchObject({
      ok: false,
      error: { kind: 'empty' },
    });
  });

  it('reports a damaged picture as a result, not an exception', async () => {
    const png = quadrantImage(50, 50, 'png');
    expect(await imageToPdf(png.slice(0, 40), fit)).toMatchObject({
      ok: false,
      error: { kind: 'corrupt' },
    });
    expect(await imageToPdf(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00]), fit)).toMatchObject({
      ok: false,
      error: { kind: 'corrupt' },
    });
  });

  it('is reachable through the writer port, and its output merges with other pages', async () => {
    const writer = createPdfLibWriter();
    const made = await writer.fromImage(quadrantImage(200, 200, 'png'), defaultImagePageOptions);
    if (!made.ok) throw new Error('fromImage failed');
    const merged = await writer.assemble(new Map([['img', made.value]]), [
      { kind: 'original', sourceId: 'img', pageIndex: 0, rotation: 90 },
      { kind: 'blank', width: 100, height: 100, rotation: 0 },
    ]);
    expect(merged.ok && (await readPages(merged.value)).length).toBe(2);
  });
});
