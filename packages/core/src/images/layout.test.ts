import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MARGIN_POINTS,
  MAX_PAGE_POINTS,
  MIN_PAGE_POINTS,
  defaultImagePageOptions,
  effectiveDpi,
  pageSizeProblem,
  placeImage,
} from './layout';
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
  const paper = fc.constantFrom('fit', 'a4', 'letter', 'custom');
  const side = fc.integer({ min: MIN_PAGE_POINTS, max: MAX_PAGE_POINTS });
  const orientation = fc.constantFrom('auto', 'portrait', 'landscape');
  const margin = fc.constantFrom('none', 'small', 'large');
  const size = fc.integer({ min: 1, max: 20_000 });

  it('keeps the picture inside the page and inside the margins', () => {
    fc.assert(
      fc.property(size, size, paper, orientation, margin, side, side, (w, h, p, o, m, cw, ch) => {
        const placed = placeImage(w, h, {
          paper: p,
          custom: { width: cw, height: ch },
          orientation: o,
          margin: m,
        });
        const gap =
          p === 'fit'
            ? MARGIN_POINTS[m]
            : Math.min(MARGIN_POINTS[m], Math.min(placed.pageWidth, placed.pageHeight) / 4);
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
      fc.property(size, size, paper, orientation, margin, side, side, (w, h, p, o, m, cw, ch) => {
        const placed = placeImage(w, h, {
          paper: p,
          custom: { width: cw, height: ch },
          orientation: o,
          margin: m,
        });
        expect(placed.width / placed.height).toBeCloseTo(w / h, 3);
      }),
    );
  });

  it('copes with zero or negative sizes', () => {
    const placed = placeImage(0, -4, options({}));
    expect(Number.isFinite(placed.width) && placed.width > 0).toBe(true);
  });
});

describe('a page of the size the user typed', () => {
  const custom = (width: number, height: number, extra: Partial<ImagePageOptions> = {}) =>
    options({ paper: 'custom', custom: { width, height }, margin: 'none', ...extra });

  it('is used as typed, whatever the picture and the orientation setting', () => {
    expect(placeImage(800, 600, custom(300, 400))).toMatchObject({
      pageWidth: 300,
      pageHeight: 400,
    });
    expect(placeImage(600, 800, custom(300, 400, { orientation: 'landscape' }))).toMatchObject({
      pageWidth: 300,
      pageHeight: 400,
    });
  });

  it('scales the picture to the largest size inside the margins, centred', () => {
    const placed = placeImage(1000, 500, custom(200, 200, { margin: 'small' }));
    expect(placed.width).toBe(200 - 2 * MARGIN_POINTS.small);
    expect(placed.x).toBeCloseTo((200 - placed.width) / 2);
    expect(placed.y).toBeCloseTo((200 - placed.height) / 2);
  });

  it('never makes a page outside what PDF viewers handle, even if the numbers are absurd', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double({ noNaN: false }), fc.integer({ min: -10, max: 10 })),
        fc.oneof(fc.double({ noNaN: false }), fc.integer({ min: -10, max: 10 })),
        (width, height) => {
          const placed = placeImage(300, 200, custom(width, height));
          for (const side of [placed.pageWidth, placed.pageHeight]) {
            expect(side).toBeGreaterThanOrEqual(MIN_PAGE_POINTS);
            expect(side).toBeLessThanOrEqual(MAX_PAGE_POINTS);
          }
        },
      ),
    );
  });
});

describe('pageSizeProblem', () => {
  it('accepts sizes in range and names what is wrong otherwise', () => {
    expect(pageSizeProblem({ width: 595, height: 842 })).toBeUndefined();
    expect(pageSizeProblem({ width: MAX_PAGE_POINTS, height: MIN_PAGE_POINTS })).toBeUndefined();
    expect(pageSizeProblem({ width: 0, height: 100 })).toBe('invalid');
    expect(pageSizeProblem({ width: Number.NaN, height: 100 })).toBe('invalid');
    expect(pageSizeProblem({ width: 5, height: 100 })).toBe('tooSmall');
    expect(pageSizeProblem({ width: 100, height: MAX_PAGE_POINTS + 1 })).toBe('tooLarge');
  });
});

describe('effectiveDpi', () => {
  it('is the pixels over the inches the picture covers on the page', () => {
    const placed = placeImage(1500, 1000, options({ paper: 'letter', margin: 'none' }));
    expect(placed.width).toBeCloseTo(792); // a wide picture on Letter landscape
    expect(effectiveDpi(1500, placed)).toBeCloseTo(1500 / 11, 3);
  });

  it('a picture that is small for its page has a low resolution', () => {
    const placed = placeImage(300, 200, options({ paper: 'a4', margin: 'none' }));
    expect(effectiveDpi(300, placed)).toBeLessThan(40);
  });
});
