import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { original, workspaceOf, ids, blank } from '../test-helpers';
import type { PageRef } from '../workspace/page-ref';
import {
  bookmarkKey,
  bookmarkedPositions,
  splitByBookmarks,
  splitByRanges,
  splitEveryN,
} from './groups';
import type { PageGroup } from './groups';
import { analyzeRanges } from './ranges';
import type { PageRange } from './ranges';

const pagesOf = (count: number): PageRef[] => [...workspaceOf(count).pages];
const flat = (groups: readonly PageGroup[]): string[] =>
  groups.flatMap((g) => g.pages.map((p) => p.id));
const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('splitEveryN', () => {
  it('cuts in groups of N and lets the last one be shorter', () => {
    const groups = unwrap(splitEveryN(pagesOf(7), 3));
    expect(groups.map((g) => g.pages.length)).toEqual([3, 3, 1]);
    expect(groups.map((g) => g.span)).toEqual([
      { from: 1, to: 3 },
      { from: 4, to: 6 },
      { from: 7, to: 7 },
    ]);
  });

  it('rejects a count that is not a whole number of at least one', () => {
    for (const bad of [0, -2, 1.5, Number.NaN]) {
      expect(splitEveryN(pagesOf(3), bad)).toEqual({ ok: false, error: { kind: 'invalidCount' } });
    }
  });

  it('has nothing to split without pages', () => {
    expect(splitEveryN([], 2)).toEqual({ ok: false, error: { kind: 'noPages' } });
  });

  it('covers every page exactly once, in order, for any count and size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 70 }),
        (size, count) => {
          const pages = pagesOf(size);
          const groups = unwrap(splitEveryN(pages, count));
          expect(flat(groups)).toEqual(ids(workspaceOf(size)));
          expect(groups.slice(0, -1).every((g) => g.pages.length === count)).toBe(true);
          expect(groups.every((g) => g.pages.length >= 1 && g.pages.length <= count)).toBe(true);
        },
      ),
    );
  });
});

describe('splitByRanges', () => {
  const ranges = (...pairs: [number, number][]): PageRange[] =>
    pairs.map(([from, to]) => ({ from, to }));

  it('makes one group per range, in the order given', () => {
    const groups = unwrap(splitByRanges(pagesOf(10), ranges([5, 6], [1, 2])));
    expect(groups.map((g) => g.pages.map((p) => p.id))).toEqual([
      ['p4', 'p5'],
      ['p0', 'p1'],
    ]);
    expect(groups.every((g) => g.kind === 'range')).toBe(true);
  });

  it('drops the pages no range names, unless asked to keep them together', () => {
    const dropped = unwrap(splitByRanges(pagesOf(6), ranges([1, 2], [5, 5])));
    expect(flat(dropped)).toEqual(['p0', 'p1', 'p4']);
    const kept = unwrap(splitByRanges(pagesOf(6), ranges([1, 2], [5, 5]), 'group'));
    expect(kept.at(-1)).toMatchObject({ kind: 'rest' });
    expect(kept.at(-1)?.pages.map((p) => p.id)).toEqual(['p2', 'p3', 'p5']);
  });

  it('gives a page named twice to both groups', () => {
    expect(flat(unwrap(splitByRanges(pagesOf(4), ranges([1, 3], [3, 4]))))).toEqual([
      'p0',
      'p1',
      'p2',
      'p2',
      'p3',
    ]);
  });

  it('ignores ranges that fall outside the document', () => {
    const groups = unwrap(splitByRanges(pagesOf(3), ranges([2, 9], [7, 8])));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.span).toEqual({ from: 2, to: 3 });
  });

  it('fails when nothing is left to make a file from', () => {
    expect(splitByRanges(pagesOf(3), ranges([8, 9]))).toEqual({
      ok: false,
      error: { kind: 'noPages' },
    });
    expect(splitByRanges([], ranges([1, 1]))).toEqual({ ok: false, error: { kind: 'noPages' } });
  });

  it('with the rest kept, ranges that do not overlap use every page exactly once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.array(fc.tuple(fc.nat(39), fc.nat(6)), { maxLength: 8 }),
        (size, raw) => {
          // Build disjoint ranges from random cut points so the property has a clear precondition.
          const taken = new Set<number>();
          const disjoint: PageRange[] = [];
          for (const [start, length] of raw) {
            const from = (start % size) + 1;
            const to = Math.min(size, from + length);
            const span = Array.from({ length: to - from + 1 }, (_, i) => from + i);
            if (span.some((page) => taken.has(page))) continue;
            span.forEach((page) => taken.add(page));
            disjoint.push({ from, to });
          }
          if (disjoint.length === 0) return;
          expect(analyzeRanges(disjoint, size).repeated).toEqual([]);
          const groups = unwrap(splitByRanges(pagesOf(size), disjoint, 'group'));
          expect([...flat(groups)].sort()).toEqual([...ids(workspaceOf(size))].sort());
        },
      ),
    );
  });
});

describe('splitByBookmarks', () => {
  const marks = (entries: [string, number, string][]) =>
    new Map(entries.map(([source, index, title]) => [bookmarkKey(source, index), title] as const));

  const pages: PageRef[] = [
    original('a0', 'A', 0),
    original('a1', 'A', 1),
    original('a2', 'A', 2),
    original('a3', 'A', 3),
    original('b0', 'B', 0),
    blank('x'),
  ];

  it('starts a group at every bookmarked page and keeps the leading pages together', () => {
    const groups = unwrap(
      splitByBookmarks(
        pages,
        marks([
          ['A', 2, 'Chapter 2'],
          ['B', 0, 'Appendix'],
        ]),
      ),
    );
    expect(groups.map((g) => [g.kind, g.title, g.pages.map((p) => p.id)])).toEqual([
      ['part', undefined, ['a0', 'a1']],
      ['bookmark', 'Chapter 2', ['a2', 'a3']],
      ['bookmark', 'Appendix', ['b0', 'x']],
    ]);
  });

  it('makes a single group when no page has a bookmark', () => {
    expect(unwrap(splitByBookmarks(pages, new Map()))).toHaveLength(1);
  });

  it('never drops a page', () => {
    const all = marks([
      ['A', 0, 'One'],
      ['A', 3, 'Four'],
    ]);
    expect(flat(unwrap(splitByBookmarks(pages, all)))).toEqual(pages.map((p) => p.id));
  });

  it('has nothing to split without pages', () => {
    expect(splitByBookmarks([], new Map())).toEqual({ ok: false, error: { kind: 'noPages' } });
  });

  it('lists which positions open a new file', () => {
    expect(
      bookmarkedPositions(
        pages,
        marks([
          ['A', 2, 'x'],
          ['B', 0, 'y'],
        ]),
      ),
    ).toEqual([3, 5]);
  });
});
