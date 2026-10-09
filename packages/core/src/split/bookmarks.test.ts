import { describe, expect, it } from 'vitest';
import { bookmarksFromOutline, outlineDepth } from './bookmarks';
import { bookmarkKey } from './groups';

const outline = [
  { title: 'Part I', pageIndex: 0, level: 1 },
  { title: 'Chapter 1', pageIndex: 0, level: 2 },
  { title: 'Chapter 2', pageIndex: 4, level: 2 },
  { title: '  Part II  ', pageIndex: 8, level: 1 },
  { title: '   ', pageIndex: 9, level: 1 },
];

describe('bookmarksFromOutline', () => {
  it('keeps top-level entries by default and trims their titles', () => {
    const map = bookmarksFromOutline('s', outline);
    expect([...map]).toEqual([
      [bookmarkKey('s', 0), 'Part I'],
      [bookmarkKey('s', 8), 'Part II'],
    ]);
  });

  it('includes deeper levels on request, the first entry of a page winning', () => {
    const map = bookmarksFromOutline('s', outline, 2);
    expect(map.get(bookmarkKey('s', 0))).toBe('Part I');
    expect(map.get(bookmarkKey('s', 4))).toBe('Chapter 2');
  });

  it('ignores blank titles', () => {
    expect(bookmarksFromOutline('s', outline, 9).has(bookmarkKey('s', 9))).toBe(false);
  });
});

describe('outlineDepth', () => {
  it('is the deepest level, or 0 without bookmarks', () => {
    expect(outlineDepth(outline)).toBe(2);
    expect(outlineDepth([])).toBe(0);
  });
});
