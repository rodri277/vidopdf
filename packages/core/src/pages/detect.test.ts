import { describe, expect, it } from 'vitest';
import { NO_MARGINS } from './crop';
import { detectMargins } from './detect';

/** A white picture of width x height with a dark rectangle at [x0, x1) x [y0, y1). */
function picture(width: number, height: number, box?: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  if (box !== undefined) {
    const [x0, y0, x1, y1] = box;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const at = (y * width + x) * 4;
        data[at] = data[at + 1] = data[at + 2] = 20;
      }
    }
  }
  return data;
}

describe('detectMargins', () => {
  it('finds the empty paper around the content', () => {
    const margins = detectMargins(picture(100, 200, [20, 40, 80, 160]), 100, 200, { padding: 0 });
    for (const side of ['left', 'top', 'right', 'bottom'] as const) {
      expect(margins[side]).toBeCloseTo(0.2, 9);
    }
  });

  it('keeps a little air when asked to', () => {
    const margins = detectMargins(picture(100, 200, [20, 40, 80, 160]), 100, 200, {
      padding: 0.05,
    });
    expect(margins.left).toBeCloseTo(0.15, 6);
    expect(margins.top).toBeCloseTo(0.15, 6);
  });

  it('gives no crop for a blank page or for content that reaches every edge', () => {
    expect(detectMargins(picture(50, 50), 50, 50)).toEqual(NO_MARGINS);
    expect(detectMargins(picture(50, 50, [0, 0, 50, 50]), 50, 50)).toEqual(NO_MARGINS);
  });

  it('ignores transparent pixels and light grey paper tints above the threshold', () => {
    const data = picture(20, 20, [5, 5, 10, 10]);
    data[(0 * 20 + 0) * 4 + 3] = 0; // a transparent corner
    data[(0 * 20 + 0) * 4] = 0;
    const margins = detectMargins(data, 20, 20, { padding: 0 });
    expect(margins.left).toBeCloseTo(0.25, 6);
    const tinted = picture(20, 20).map((_value, index) => (index % 4 === 3 ? 255 : 250));
    expect(detectMargins(tinted, 20, 20)).toEqual(NO_MARGINS);
  });

  it('never leaves less than a tenth of the page', () => {
    const margins = detectMargins(picture(100, 100, [49, 49, 50, 50]), 100, 100, { padding: 0 });
    expect(1 - margins.left - margins.right).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });
});
