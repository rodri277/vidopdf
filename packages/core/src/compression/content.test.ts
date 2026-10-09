import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { IDENTITY, drawnObjects, drawnSize, multiply } from './content';
import type { Matrix } from '../images/orientation';

const stream = (text: string) => new TextEncoder().encode(text);
const sizes = (text: string, start: Matrix = IDENTITY) =>
  drawnObjects(stream(text), start).map((o) => ({ name: o.name, ...drawnSize(o.matrix) }));

describe('drawnObjects', () => {
  it('reports a picture with the size its matrix gives it', () => {
    expect(sizes('q 200 0 0 100 50 60 cm /Im1 Do Q')).toEqual([
      { name: 'Im1', width: 200, height: 100 },
    ]);
  });

  it('follows nested q and Q, so a matrix does not leak out of its block', () => {
    const found = sizes('q 100 0 0 100 0 0 cm q 2 0 0 2 0 0 cm /A Do Q /B Do Q /C Do');
    expect(found).toEqual([
      { name: 'A', width: 200, height: 200 },
      { name: 'B', width: 100, height: 100 },
      { name: 'C', width: 1, height: 1 },
    ]);
  });

  it('measures a rotated picture by the length of its sides, not by its matrix entries', () => {
    // 100 x 50 rotated by 90 degrees: a = 0, b = 100, c = -50, d = 0.
    const [only] = sizes('q 0 100 -50 0 10 10 cm /R Do Q');
    expect(only?.width).toBeCloseTo(100);
    expect(only?.height).toBeCloseTo(50);
  });

  it('starts from the matrix it is given (a form that is itself scaled)', () => {
    expect(sizes('q 10 0 0 10 0 0 cm /I Do Q', [2, 0, 0, 2, 0, 0])).toEqual([
      { name: 'I', width: 20, height: 20 },
    ]);
  });

  it('is not fooled by operators that appear inside strings, comments or hex strings', () => {
    const found = sizes(
      'BT (q 999 0 0 999 0 0 cm /Fake Do Q) Tj ET\n% /Fake2 Do\n<712044 6F> Tj q 5 0 0 5 0 0 cm /Real Do Q',
    );
    expect(found).toEqual([{ name: 'Real', width: 5, height: 5 }]);
  });

  it('copes with escaped and nested parentheses in strings', () => {
    expect(sizes('(a \\) b ( c ) /Fake Do) Tj q 3 0 0 3 0 0 cm /Real Do Q')).toEqual([
      { name: 'Real', width: 3, height: 3 },
    ]);
  });

  it('skips an inline picture, even one whose data looks like operators', () => {
    const text = 'q 10 0 0 10 0 0 cm BI /W 2 /H 2 /CS /G /BPC 8 ID q /Fake Do EI Q /After Do';
    expect(sizes(text).map((o) => o.name)).toEqual(['After']);
  });

  it('reads arrays and dictionaries without losing its place', () => {
    const text =
      '[ (a) 20 (b) ] TJ /GS1 << /ca 0.5 /Type /ExtGState >> gs q 7 0 0 7 0 0 cm /Img Do Q';
    expect(sizes(text)).toEqual([{ name: 'Img', width: 7, height: 7 }]);
  });

  it('ignores a cm with the wrong number of operands and a Do with no name', () => {
    expect(sizes('q 1 2 3 cm /X Do Q')).toEqual([{ name: 'X', width: 1, height: 1 }]);
    expect(sizes('Do')).toEqual([]);
  });

  it('handles an unbalanced Q and an empty stream', () => {
    expect(sizes('Q Q /X Do')).toEqual([{ name: 'X', width: 1, height: 1 }]);
    expect(drawnObjects(new Uint8Array(0))).toEqual([]);
  });

  it('never throws, whatever bytes it is given', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        expect(() => drawnObjects(bytes)).not.toThrow();
      }),
    );
  });

  it('terminates on an unterminated string, hex string and inline image', () => {
    expect(drawnObjects(stream('(never closed /X Do'))).toEqual([]);
    expect(drawnObjects(stream('<abc /X Do'))).toEqual([]);
    expect(drawnObjects(stream('BI /W 1 ID data without end'))).toEqual([]);
  });
});

describe('multiply', () => {
  it('applies the outer matrix after the inner one', () => {
    // Scale by 2 first, then move by (10, 20).
    expect(multiply([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 10, 20])).toEqual([2, 0, 0, 2, 10, 20]);
    // Move by (10, 20) first, then scale by 2: the move is doubled.
    expect(multiply([1, 0, 0, 1, 10, 20], [2, 0, 0, 2, 0, 0])).toEqual([2, 0, 0, 2, 20, 40]);
  });

  it('has the identity as a neutral element on both sides', () => {
    fc.assert(
      fc.property(
        fc.tuple(...Array.from({ length: 6 }, () => fc.integer({ min: -50, max: 50 }))),
        (m) => {
          const matrix = m as unknown as Matrix;
          expect(multiply(matrix, IDENTITY)).toEqual(matrix);
          expect(multiply(IDENTITY, matrix)).toEqual(matrix);
        },
      ),
    );
  });
});
