import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_PIXELS } from '@vidopdf/core';
import { pickScale } from './scale';

describe('pickScale', () => {
  it('scales a normal page to the requested width', () => {
    expect(pickScale(600, 800, 300)).toBe(0.5);
  });

  it('never allocates more than the pixel budget, even if more width is requested', () => {
    const scale = pickScale(600, 800, 100_000);
    expect(600 * scale * (800 * scale)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  it('renders a gigantic page at the width asked for, not at its natural size', () => {
    expect(pickScale(200_000, 200_000, 300)).toBe(0.0015);
  });
});
