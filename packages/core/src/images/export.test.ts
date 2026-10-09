import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_PIXELS } from '../limits';
import {
  DPI_MAX,
  DPI_MIN,
  clampDpi,
  clampQuality,
  fitResolution,
  imageExtension,
  imageFileName,
  imageMime,
  pixelSize,
} from './export';

describe('clampDpi and clampQuality', () => {
  it('keep values inside the supported range and rescue nonsense', () => {
    expect(clampDpi(10)).toBe(DPI_MIN);
    expect(clampDpi(1000)).toBe(DPI_MAX);
    expect(clampDpi(149.6)).toBe(150);
    expect(clampDpi(Number.NaN)).toBe(150);
    expect(clampQuality(0.1)).toBe(0.5);
    expect(clampQuality(7)).toBe(1);
    expect(clampQuality(Number.NaN)).toBe(0.9);
  });
});

describe('pixelSize', () => {
  it('converts points to pixels at a resolution', () => {
    expect(pixelSize(595, 842, 72)).toEqual({ width: 595, height: 842 });
    expect(pixelSize(595, 842, 300)).toEqual({ width: 2479, height: 3508 });
  });

  it('never returns an empty image', () => {
    expect(pixelSize(0.1, 0.1, 72)).toEqual({ width: 1, height: 1 });
  });
});

describe('fitResolution', () => {
  it('leaves an A4 page at 300 dpi alone (8.7 megapixels)', () => {
    expect(fitResolution(595, 842, 300)).toMatchObject({
      dpi: 300,
      capped: false,
      width: 2479,
      height: 3508,
    });
  });

  it('lowers the resolution of a poster-sized page until it fits the budget', () => {
    const fitted = fitResolution(3000, 4000, 300);
    expect(fitted.capped).toBe(true);
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(fitted.dpi).toBeLessThan(300);
    expect(fitted.dpi).toBeGreaterThan(0);
  });

  it('never exceeds the budget, whatever the page', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15_000 }),
        fc.integer({ min: 1, max: 15_000 }),
        fc.integer({ min: 72, max: 300 }),
        (w, h, dpi) => {
          const fitted = fitResolution(w, h, dpi);
          expect(fitted.width * fitted.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
          expect(fitted.capped).toBe(fitted.dpi < clampDpi(dpi) - 1e-9);
        },
      ),
    );
  });
});

describe('file names', () => {
  it('numbers pages to the width of the document', () => {
    expect(imageFileName('report', 7, 120, 'png')).toBe('report-007.png');
    expect(imageFileName('report', 3, 9, 'jpeg')).toBe('report-3.jpg');
    expect(imageFileName('../x', 1, 1, 'webp')).toBe('_x-1.webp');
    expect(imageFileName('', 1, 1, 'png')).toBe('page-1.png');
  });

  it('knows each format', () => {
    expect(imageMime('jpeg')).toBe('image/jpeg');
    expect(imageExtension('jpeg')).toBe('jpg');
    expect(imageExtension('png')).toBe('png');
  });
});
