import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cropBox, NO_MARGINS, normalizeCrop } from '../pages/crop';
import type { Rotation } from '../workspace/page-ref';
import { ANCHORS, presets } from './stamp';
import { anchoredBox, displaySize, displayToPdf, placeStamp, toPdfPlacement } from './placement';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const page = { width: 600, height: 800 };

describe('displaySize', () => {
  it('swaps the sides of a page turned a quarter', () => {
    expect(displaySize(page, 0)).toEqual(page);
    expect(displaySize(page, 90)).toEqual({ width: 800, height: 600 });
    expect(displaySize(page, 180)).toEqual(page);
    expect(displaySize(page, 270)).toEqual({ width: 800, height: 600 });
  });
});

describe('anchoredBox', () => {
  const box = { width: 100, height: 20 };
  it('puts each anchor where its name says, keeping the margin from the edges', () => {
    expect(anchoredBox('topLeft', page, box, 30)).toEqual({ x: 30, y: 30 });
    expect(anchoredBox('topRight', page, box, 30)).toEqual({ x: 470, y: 30 });
    expect(anchoredBox('bottomLeft', page, box, 30)).toEqual({ x: 30, y: 750 });
    expect(anchoredBox('bottomRight', page, box, 30)).toEqual({ x: 470, y: 750 });
    expect(anchoredBox('center', page, box, 30)).toEqual({ x: 250, y: 390 });
    expect(anchoredBox('topCenter', page, box, 30)).toEqual({ x: 250, y: 30 });
    expect(anchoredBox('middleLeft', page, box, 30)).toEqual({ x: 30, y: 390 });
  });

  it('never leaves the page when the box fits and the margin is small', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ANCHORS),
        fc.integer({ min: 0, max: 50 }),
        (anchor, margin) => {
          const corner = anchoredBox(anchor, page, box, margin);
          expect(corner.x).toBeGreaterThanOrEqual(0);
          expect(corner.y).toBeGreaterThanOrEqual(0);
          expect(corner.x + box.width).toBeLessThanOrEqual(page.width);
          expect(corner.y + box.height).toBeLessThanOrEqual(page.height);
        },
      ),
    );
  });
});

describe('displayToPdf', () => {
  // The four corners of the page as the reader sees it, for a 600 x 800 stored page.
  it('maps the top-left corner of the reader view to the right corner of the stored page', () => {
    // Stored page, y up: bottom-left (0,0), top-left (0,800), bottom-right (600,0), top-right.
    expect(displayToPdf({ x: 0, y: 0 }, displaySize(page, 0), 0)).toEqual({ x: 0, y: 800 });
    expect(displayToPdf({ x: 0, y: 0 }, displaySize(page, 90), 90)).toEqual({ x: 0, y: 0 });
    expect(displayToPdf({ x: 0, y: 0 }, displaySize(page, 180), 180)).toEqual({ x: 600, y: 0 });
    expect(displayToPdf({ x: 0, y: 0 }, displaySize(page, 270), 270)).toEqual({ x: 600, y: 800 });
  });

  it('keeps distances: two display points are as far apart in the stored page', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROTATIONS),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (rotation, x1, y1, x2, y2) => {
          const view = displaySize(page, rotation);
          const a = displayToPdf({ x: x1, y: y1 }, view, rotation);
          const b = displayToPdf({ x: x2, y: y2 }, view, rotation);
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(x1 - x2, y1 - y2), 6);
        },
      ),
    );
  });
});

describe('toPdfPlacement', () => {
  const stamp = { ...presets.pageNumber('s'), anchor: 'bottomRight' as const, margin: 20 };
  const box = { width: 60, height: 12 };

  it('turns the stamp back by the rotation of the page so it reads upright', () => {
    for (const rotation of ROTATIONS) {
      const view = displaySize(page, rotation);
      const placed = toPdfPlacement(placeStamp(stamp, view, box), view, rotation);
      const expected = rotation === 270 ? -90 : rotation;
      expect(placed.angle).toBe(expected);
    }
  });

  it('puts the corner of an upright stamp at the same place the reader sees it, for every rotation', () => {
    // The bottom-right stamp must end up near the display's bottom-right corner, whatever the
    // page rotation: map the corner back and compare with the stamp centre.
    for (const rotation of ROTATIONS) {
      const view = displaySize(page, rotation);
      const display = placeStamp(stamp, view, box);
      const placed = toPdfPlacement(display, view, rotation);
      const corner = displayToPdf({ x: view.width, y: view.height }, view, rotation);
      expect(Math.hypot(placed.center.x - corner.x, placed.center.y - corner.y)).toBeLessThan(
        Math.hypot(view.width, view.height) / 4,
      );
      expect(Math.hypot(placed.center.x - corner.x, placed.center.y - corner.y)).toBeCloseTo(
        Math.hypot(view.width - display.center.x, view.height - display.center.y),
        6,
      );
    }
  });

  it('the origin is the bottom-left corner of the box once it is turned about its centre', () => {
    const placed = toPdfPlacement(
      { center: { x: 100, y: 100 }, box: { width: 40, height: 10 }, angle: 0 },
      { width: 300, height: 400 },
      0,
    );
    expect(placed.origin.x).toBeCloseTo(80, 6);
    expect(placed.origin.y).toBeCloseTo(400 - 100 - 5, 6);
    const quarter = toPdfPlacement(
      { center: { x: 100, y: 100 }, box: { width: 40, height: 10 }, angle: 90 },
      { width: 300, height: 400 },
      0,
    );
    // Turned a quarter: the box is 10 wide and 40 tall around the same centre.
    expect(quarter.origin.x).toBeCloseTo(100 + 5, 6);
    expect(quarter.origin.y).toBeCloseTo(300 - 20, 6);
  });
});

describe('crop', () => {
  it('turns the cut with the page: the same display rectangle gives the same stored rectangle', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROTATIONS),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        (rotation, top, right, bottom, left) => {
          const view = displaySize(page, rotation);
          const box = cropBox(page, { top, right, bottom, left }, rotation);
          // Corners of the cut rectangle as the reader sees it, mapped to the stored page.
          const a = displayToPdf({ x: left * view.width, y: top * view.height }, view, rotation);
          const b = displayToPdf(
            { x: view.width * (1 - right), y: view.height * (1 - bottom) },
            view,
            rotation,
          );
          expect(Math.min(a.x, b.x)).toBeCloseTo(box.x, 6);
          expect(Math.min(a.y, b.y)).toBeCloseTo(box.y, 6);
          expect(Math.abs(a.x - b.x)).toBeCloseTo(box.width, 6);
          expect(Math.abs(a.y - b.y)).toBeCloseTo(box.height, 6);
        },
      ),
    );
  });

  it('keeps something of the page and never a negative or broken margin', () => {
    expect(normalizeCrop({ top: 0.8, right: 0, bottom: 0.8, left: -1 })).toMatchObject({
      left: 0,
    });
    const fixed = normalizeCrop({ top: 0.8, right: 0.7, bottom: 0.8, left: 0.7 });
    expect(fixed.top + fixed.bottom).toBeCloseTo(0.9, 6);
    expect(fixed.left + fixed.right).toBeCloseTo(0.9, 6);
    expect(normalizeCrop({ top: Number.NaN, right: 0, bottom: 0, left: 0 })).toEqual(NO_MARGINS);
  });
});
