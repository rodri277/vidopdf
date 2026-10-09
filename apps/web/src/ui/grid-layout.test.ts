import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellRect, gapAt, gridMetrics, indicesInRect, visibleRange } from './grid-layout';

// 1000 px wide, 24 px padding, 16 px gap, 200 px cells: floor((952 + 16) / 216) = 4 columns.
const metrics = (count: number) => gridMetrics(count, 1000, 200);

describe('gridMetrics', () => {
  it('fits as many columns as the width allows and centres them', () => {
    const m = metrics(10);
    expect(m.columns).toBe(4);
    expect(m.rows).toBe(3);
    const used = 4 * 200 + 3 * 16;
    expect(m.offsetX).toBeCloseTo(24 + (952 - used) / 2);
  });

  it('always has at least one column, even in a very narrow container', () => {
    expect(gridMetrics(5, 50, 200).columns).toBe(1);
  });

  it('has no height when empty', () => {
    expect(metrics(0).contentHeight).toBe(0);
  });

  it('places cells left to right, then top to bottom', () => {
    const m = metrics(10);
    expect(cellRect(m, 1).x - cellRect(m, 0).x).toBe(216);
    expect(cellRect(m, 4)).toMatchObject({ x: cellRect(m, 0).x, y: m.paddingY + m.rowPitch });
  });
});

describe('indicesInRect', () => {
  const m = metrics(10);

  it('finds the cells a rectangle touches', () => {
    const a = cellRect(m, 1);
    const b = cellRect(m, 6);
    const rect = { x: a.x + 10, y: a.y + 10, width: b.x - a.x, height: b.y - a.y };
    expect(indicesInRect(m, rect)).toEqual([1, 2, 5, 6]);
  });

  it('finds nothing in the gaps between cells', () => {
    const a = cellRect(m, 0);
    expect(indicesInRect(m, { x: a.x + a.width + 2, y: a.y + 2, width: 10, height: 10 })).toEqual(
      [],
    );
  });

  it('stops at the last page even if the rectangle covers an empty slot', () => {
    const everything = { x: 0, y: 0, width: 5000, height: 5000 };
    expect(indicesInRect(m, everything)).toHaveLength(10);
  });

  it('is empty for an empty grid', () => {
    expect(indicesInRect(metrics(0), { x: 0, y: 0, width: 999, height: 999 })).toEqual([]);
  });
});

describe('gapAt', () => {
  const m = metrics(10);
  const first = cellRect(m, 0);
  const at = (index: number, fraction: number, dy = 5) => {
    const cell = cellRect(m, index);
    return gapAt(m, cell.x + cell.width * fraction, cell.y + dy);
  };

  it('chooses the gap before a cell on its left half and after it on its right half', () => {
    expect(at(2, 0.2)).toMatchObject({ index: 2, column: 2 });
    expect(at(2, 0.8)).toMatchObject({ index: 3, column: 3 });
  });

  it('can put a page at the very start and very end', () => {
    expect(gapAt(m, first.x - 20, first.y)).toMatchObject({ index: 0 });
    const last = cellRect(m, 9);
    expect(gapAt(m, last.x + last.width + 50, last.y).index).toBe(10);
  });

  it('draws the line at the end of the row for the last column', () => {
    expect(at(3, 0.9)).toMatchObject({ index: 4, row: 0, column: 4 });
  });

  it('clamps to the rows that exist and tolerates an empty grid', () => {
    expect(gapAt(m, 0, 99999).index).toBe(8);
    expect(gapAt(metrics(0), 10, 10)).toEqual({ index: 0, row: 0, column: 0 });
  });

  it('never returns an index outside the list', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: -500, max: 2000 }),
        fc.integer({ min: -500, max: 9000 }),
        (count, x, y) => {
          const { index } = gapAt(metrics(count), x, y);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThanOrEqual(count);
        },
      ),
    );
  });
});

describe('visibleRange', () => {
  const m = metrics(100);

  it('covers the rows in view plus the overscan', () => {
    const { first, last } = visibleRange(m, 0, 400, 0);
    expect(first).toBe(0);
    expect(last).toBeGreaterThanOrEqual(3);
    expect(last % 4).toBe(3);
  });

  it('starts further down after scrolling and clamps at the last page', () => {
    expect(visibleRange(m, 2000, 400, 0).first).toBeGreaterThan(0);
    expect(visibleRange(m, 10_000_000, 400, 0).last).toBe(99);
  });

  it('is empty without pages', () => {
    expect(visibleRange(metrics(0), 0, 400)).toEqual({ first: 0, last: -1 });
  });
});
