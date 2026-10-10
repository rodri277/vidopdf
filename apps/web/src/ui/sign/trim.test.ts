import { describe, expect, it } from 'vitest';
import { inkBounds } from './trim';

describe('inkBounds', () => {
  it('finds the box around what is drawn', () => {
    const data = new Uint8ClampedArray(10 * 6 * 4);
    for (const [x, y] of [
      [2, 1],
      [7, 4],
    ] as const)
      data[(y * 10 + x) * 4 + 3] = 255;
    expect(inkBounds(data, 10, 6)).toEqual({ left: 2, top: 1, width: 6, height: 4 });
  });

  it('is undefined when nothing was drawn, and ignores near-invisible pixels', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    expect(inkBounds(data, 4, 4)).toBeUndefined();
    data[3] = 5;
    expect(inkBounds(data, 4, 4)).toBeUndefined();
  });
});
