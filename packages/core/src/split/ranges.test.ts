import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeRanges, formatRange, parseRanges, toRanges } from './ranges';

const values = (text: string, pageCount = 20) => {
  const result = parseRanges(text, pageCount);
  if (!result.ok) throw new Error(`unexpected ${JSON.stringify(result.error)}`);
  return result.value;
};
const problem = (text: string, pageCount = 20) => {
  const result = parseRanges(text, pageCount);
  if (result.ok) throw new Error('expected a problem');
  return result.error;
};

describe('parseRanges', () => {
  it('reads single pages, spans and open spans', () => {
    expect(values('1-3, 5, 8-')).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 5 },
      { from: 8, to: 20 },
    ]);
  });

  it('accepts commas, semicolons, new lines and loose spacing', () => {
    expect(values('2 - 4;7\n9 -10 ,')).toEqual([
      { from: 2, to: 4 },
      { from: 7, to: 7 },
      { from: 9, to: 10 },
    ]);
  });

  it('keeps the order and the repeats the user wrote', () => {
    expect(values('5, 1-2, 5')).toHaveLength(3);
  });

  it('reports each kind of problem with the text that caused it', () => {
    expect(problem('')).toEqual({ kind: 'empty' });
    expect(problem(' , ; ')).toEqual({ kind: 'empty' });
    expect(problem('1-3, abc')).toEqual({ kind: 'syntax', token: 'abc' });
    expect(problem('1--3')).toEqual({ kind: 'syntax', token: '1--3' });
    expect(problem('0')).toEqual({ kind: 'zero', token: '0' });
    expect(problem('0-3')).toEqual({ kind: 'zero', token: '0-3' });
    expect(problem('9-3')).toEqual({ kind: 'reversed', token: '9-3' });
    expect(problem('18-25')).toEqual({ kind: 'outOfRange', token: '18-25', pageCount: 20 });
    expect(problem('21')).toEqual({ kind: 'outOfRange', token: '21', pageCount: 20 });
  });

  it('stops at the first problem', () => {
    expect(problem('x, 99')).toMatchObject({ kind: 'syntax' });
  });

  it('round-trips with formatRange', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (from, extra) => {
          const range = { from, to: from + extra };
          expect(values(formatRange(range), from + extra)).toEqual([range]);
        },
      ),
    );
  });
});

describe('toRanges', () => {
  it('folds consecutive pages', () => {
    expect(toRanges([1, 2, 3, 7, 9, 10])).toEqual([
      { from: 1, to: 3 },
      { from: 7, to: 7 },
      { from: 9, to: 10 },
    ]);
    expect(toRanges([])).toEqual([]);
  });
});

describe('analyzeRanges', () => {
  it('lists the pages left out and the pages used twice', () => {
    const coverage = analyzeRanges(
      [
        { from: 1, to: 3 },
        { from: 3, to: 4 },
        { from: 8, to: 8 },
      ],
      10,
    );
    expect(coverage.repeated).toEqual([3]);
    expect(coverage.unassigned).toEqual([5, 6, 7, 9, 10]);
  });

  it('reports nothing for a perfect partition', () => {
    expect(
      analyzeRanges(
        [
          { from: 1, to: 4 },
          { from: 5, to: 6 },
        ],
        6,
      ),
    ).toEqual({ repeated: [], unassigned: [] });
  });
});
