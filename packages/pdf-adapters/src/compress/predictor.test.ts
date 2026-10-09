import { describe, expect, it } from 'vitest';
import { undoPredictor } from './predictor';

const params = (predictor: number, changes = {}) => ({
  predictor,
  colors: 3,
  bitsPerComponent: 8,
  columns: 2,
  ...changes,
});

// Two rows of two RGB pixels.
const plain = Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);

const paeth = (left: number, up: number, upLeft: number) => {
  const p = left + up - upLeft;
  const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
  if (a <= b && a <= c) return left;
  return b <= c ? up : upLeft;
};

const at = (y: number, i: number) => (y >= 0 && i >= 0 ? (plain[y * 6 + i] ?? 0) : 0);

/** Encodes `plain` with one PNG filter type on every row, the way a PDF producer would. */
function pngEncode(type: number): Uint8Array {
  const out: number[] = [];
  for (let y = 0; y < 2; y++) {
    out.push(type);
    for (let i = 0; i < 6; i++) {
      const [left, up, upLeft] = [at(y, i - 3), at(y - 1, i), at(y - 1, i - 3)];
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][type] ?? 0;
      out.push((at(y, i) - predicted) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

describe('undoPredictor', () => {
  it('leaves data without a predictor as it is', () => {
    expect(undoPredictor(plain, params(1), 2, 2, 3)).toBe(plain);
  });

  for (const type of [0, 1, 2, 3, 4]) {
    it(`undoes PNG filter type ${String(type)}`, () => {
      expect([...(undoPredictor(pngEncode(type), params(15), 2, 2, 3) ?? [])]).toEqual([...plain]);
    });
  }

  it('undoes the TIFF predictor', () => {
    const encoded = Uint8Array.from([10, 20, 30, 30, 30, 30, 70, 80, 90, 30, 30, 30]);
    expect([...(undoPredictor(encoded, params(2), 2, 2, 3) ?? [])]).toEqual([...plain]);
  });

  it('refuses what it cannot read rather than guessing', () => {
    expect(
      undoPredictor(pngEncode(1), params(15, { bitsPerComponent: 16 }), 2, 2, 3),
    ).toBeUndefined();
    expect(undoPredictor(pngEncode(1), params(15, { colors: 1 }), 2, 2, 3)).toBeUndefined();
    expect(undoPredictor(pngEncode(1), params(15, { columns: 3 }), 2, 2, 3)).toBeUndefined();
    expect(undoPredictor(pngEncode(1).slice(0, 5), params(15), 2, 2, 3)).toBeUndefined();
    const badType = pngEncode(1);
    badType[0] = 7;
    expect(undoPredictor(badType, params(15), 2, 2, 3)).toBeUndefined();
    expect(undoPredictor(plain, params(5), 2, 2, 3)).toBeUndefined();
  });
});
