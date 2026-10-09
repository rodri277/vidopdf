import { describe, expect, it } from 'vitest';
import type { OutlineEntry, PageRef } from '@vidopdf/core';
import {
  defaultSplitDraft,
  groupsFor,
  isInstant,
  sameSpec,
  specFromDraft,
  splitHereDraft,
  usableBookmarks,
} from './split';

const pages: PageRef[] = [
  ...Array.from({ length: 4 }, (_, i) => ({
    kind: 'original' as const,
    id: `a${String(i)}`,
    sourceId: 'A',
    sourceIndex: i,
    rotation: 0 as const,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    kind: 'original' as const,
    id: `b${String(i)}`,
    sourceId: 'B',
    sourceIndex: i,
    rotation: 0 as const,
  })),
];
const outlines: Record<string, OutlineEntry[]> = {
  A: [
    { title: 'One', pageIndex: 0, level: 1 },
    { title: 'One.a', pageIndex: 1, level: 2 },
    { title: 'Two', pageIndex: 2, level: 1 },
  ],
  B: [{ title: 'Appendix', pageIndex: 0, level: 1 }],
};
const sizes = (result: ReturnType<typeof groupsFor>) =>
  result.ok ? result.value.map((g) => g.pages.length) : result.error;

describe('groupsFor', () => {
  it('splits every N pages', () => {
    expect(sizes(groupsFor({ mode: 'every', count: 4 }, pages, outlines))).toEqual([4, 2]);
    expect(groupsFor({ mode: 'every', count: 0 }, pages, outlines)).toMatchObject({
      ok: false,
      error: { kind: 'invalidCount' },
    });
  });

  it('reads the ranges the user typed, with the rest if asked', () => {
    expect(
      sizes(groupsFor({ mode: 'ranges', text: '1-2, 5', keepRest: false }, pages, outlines)),
    ).toEqual([2, 1]);
    expect(
      sizes(groupsFor({ mode: 'ranges', text: '1-2, 5', keepRest: true }, pages, outlines)),
    ).toEqual([2, 1, 3]);
  });

  it('turns a typing mistake into an error that names it', () => {
    expect(groupsFor({ mode: 'ranges', text: '1-99', keepRest: false }, pages, outlines)).toEqual({
      ok: false,
      error: { kind: 'ranges', problem: { kind: 'outOfRange', token: '1-99', pageCount: 6 } },
    });
    expect(groupsFor({ mode: 'ranges', text: '', keepRest: false }, pages, outlines)).toMatchObject(
      {
        error: { kind: 'ranges', problem: { kind: 'empty' } },
      },
    );
  });

  it('cuts at the bookmarks of every file, at the chosen level', () => {
    expect(sizes(groupsFor({ mode: 'bookmarks', level: 1 }, pages, outlines))).toEqual([2, 2, 2]);
    expect(sizes(groupsFor({ mode: 'bookmarks', level: 2 }, pages, outlines))).toEqual([
      1, 1, 2, 2,
    ]);
  });

  it('keeps one group when nothing has bookmarks', () => {
    expect(sizes(groupsFor({ mode: 'bookmarks', level: 1 }, pages, {}))).toEqual([6]);
  });
});

describe('usableBookmarks', () => {
  it('counts the pages of the workspace that open a bookmark', () => {
    expect(usableBookmarks(pages, outlines, 1)).toBe(3);
    expect(usableBookmarks(pages.slice(1), outlines, 1)).toBe(2);
    expect(usableBookmarks(pages, {}, 1)).toBe(0);
  });
});

describe('isInstant', () => {
  it('is false only for the size mode', () => {
    expect(isInstant({ mode: 'size', limitBytes: 1 })).toBe(false);
    expect(isInstant({ mode: 'every', count: 2 })).toBe(true);
  });
});

describe('specFromDraft', () => {
  it('turns each kind of form into the request it stands for', () => {
    expect(specFromDraft({ ...defaultSplitDraft, kind: 'every', every: 7 })).toEqual({
      mode: 'every',
      count: 7,
    });
    expect(
      specFromDraft({ ...defaultSplitDraft, kind: 'ranges', ranges: '1-3', keepRest: false }),
    ).toEqual({
      mode: 'ranges',
      text: '1-3',
      keepRest: false,
    });
    expect(specFromDraft({ ...defaultSplitDraft, kind: 'bookmarks', level: 2 })).toEqual({
      mode: 'bookmarks',
      level: 2,
    });
  });

  it('converts the size to bytes with 1024-based units', () => {
    expect(
      specFromDraft({ ...defaultSplitDraft, kind: 'size', sizeValue: 2, sizeUnit: 'MB' }),
    ).toEqual({
      mode: 'size',
      limitBytes: 2 * 1024 * 1024,
    });
    expect(
      specFromDraft({ ...defaultSplitDraft, kind: 'size', sizeValue: 500, sizeUnit: 'KB' }),
    ).toEqual({
      mode: 'size',
      limitBytes: 512_000,
    });
  });
});

describe('sameSpec and splitHereDraft', () => {
  it('compares requests by value', () => {
    expect(sameSpec({ mode: 'every', count: 2 }, { mode: 'every', count: 2 })).toBe(true);
    expect(sameSpec({ mode: 'every', count: 2 }, { mode: 'every', count: 3 })).toBe(false);
  });

  it('makes two files: up to the page and everything after it', () => {
    const draft = splitHereDraft(4, 10);
    expect(draft).toMatchObject({ kind: 'ranges', ranges: '1-4, 5-10', keepRest: false });
    const spec = specFromDraft(draft);
    const pages = Array.from({ length: 10 }, (_, i) => ({
      kind: 'original' as const,
      id: `p${String(i)}`,
      sourceId: 'S',
      sourceIndex: i,
      rotation: 0 as const,
    }));
    expect(sizes(groupsFor(spec as Exclude<typeof spec, { mode: 'size' }>, pages, {}))).toEqual([
      4, 6,
    ]);
  });
});
