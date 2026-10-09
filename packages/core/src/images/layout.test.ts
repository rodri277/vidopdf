import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MARGIN_POINTS, defaultImagePageOptions, placeImage } from './layout';
import type { ImagePageOptions } from './layout';

const options = (changes: Partial<ImagePageOptions>): ImagePageOptions => ({
  ...defaultImagePageOptions,
  ...changes,
});

describe('placeImage on paper', () => {
  it('uses A4 portrait for a portrait picture and A4 landscape for a wide one, when orientation is automatic', () => {
    expect(placeImage(600, 800, options({}))).toMatchObject({ pageWidth: 595, pageHeight: 842 });
    expect(placeImage(800, 600, options({}))).toMatchObject({ pageWidth: 842, pageHeight: 595 });
  });

  it('obeys a fixed orientation whatever the picture looks like', () => {
    expect(placeImage(800, 600, options({ orientation: 'portrait' }))).toMatchObject({
      pageWidth: 595,
    });
    expect(placeImage(600, 800, options({ orientation: 'landscape' }))).toMatchObject({
      pageWidth: 842,
    });
  });

  it('knows Letter', () => {
    expect(placeImage(600, 800, options({ paper: 'letter' }))).toMatchObject({
      pageWidth: 612,
      pageHeight: 792,
    });
  });

  it('scales a picture to fill the area inside the margins and centres it', () => {
    const placed = placeImage(1000, 1000, options({ margin: 'large' }));
    expect(placed.width).toBeCloseTo(595 - 72);
    expect(placed.height).toBeCloseTo(595 - 72);
    expect(placed.x).toBeCloseTo((595 - placed.width) / 2);
    expect(placed.y).toBeCloseTo((842 - placed.height) / 2);
  });

  it('enlarges a small picture and shrinks a big one to the same box', () => {
    const small = placeImage(50, 50, options({ margin: 'none' }));
    const big = placeImage(9000, 9000, options({ margin: 'none' }));
    expect(small.width).toBeCloseTo(big.width);
  });
});

describe('placeImage with "fit"', () => {
  it('gives the page the picture size at 96 dpi, plus the margins', () => {
    const placed = placeImage(400, 200, options({ paper: 'fit', margin: 'small' }));
    expect(placed).toMatchObject({
      width: 300,
      height: 150,
      pageWidth: 336,
      pageHeight: 186,
      x: 18,
      y: 18,
    });
  });

  it('shrinks a huge picture so its long side stays at A3 size', () => {
    const placed = placeImage(8000, 4000, options({ paper: 'fit', margin: 'none' }));
    expect(placed.width).toBeCloseTo(1190);
    expect(placed.height).toBeCloseTo(595);
  });
});

describe('placeImage properties', () => {
  const paper = fc.constantFrom('fit', 'a4', 'letter');
  const orientation = fc.constantFrom('auto', 'portrait', 'landscape');
  const margin = fc.constantFrom('none', 'small', 'large');
  const size = fc.integer({ min: 1, max: 20_000 });

  it('keeps the picture inside the page and inside the margins', () => {
    fc.assert(
      fc.property(size, size, paper, orientation, margin, (w, h, p, o, m) => {
        const placed = placeImage(w, h, { paper: p, orientation: o, margin: m });
        const gap = MARGIN_POINTS[m];
        const eps = 1e-6;
        expect(placed.x).toBeGreaterThanOrEqual(gap - eps);
        expect(placed.y).toBeGreaterThanOrEqual(gap - eps);
        expect(placed.x + placed.width).toBeLessThanOrEqual(placed.pageWidth - gap + eps);
        expect(placed.y + placed.height).toBeLessThanOrEqual(placed.pageHeight - gap + eps);
      }),
    );
  });

  it('never distorts the picture', () => {
    fc.assert(
      fc.property(size, size, paper, orientation, margin, (w, h, p, o, m) => {
        const placed = placeImage(w, h, { paper: p, orientation: o, margin: m });
        expect(placed.width / placed.height).toBeCloseTo(w / h, 3);
      }),
    );
  });

  it('copes with zero or negative sizes', () => {
    const placed = placeImage(0, -4, options({}));
    expect(Number.isFinite(placed.width) && placed.width > 0).toBe(true);
  });
});
