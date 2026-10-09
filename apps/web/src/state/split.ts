import {
  bookmarkKey,
  bookmarksFromOutline,
  err,
  parseRanges,
  splitByBookmarks,
  splitByRanges,
  splitEveryN,
} from '@vidopdf/core';
import type { OutlineEntry, PageGroup, PageRef, Result, SplitError } from '@vidopdf/core';

/** What the user asked for in the split dialog. */
export type SplitSpec =
  | { readonly mode: 'ranges'; readonly text: string; readonly keepRest: boolean }
  | { readonly mode: 'every'; readonly count: number }
  | { readonly mode: 'bookmarks'; readonly level: number }
  | { readonly mode: 'size'; readonly limitBytes: number };

/** Every mode but "size" can be planned instantly; "size" has to build PDFs to measure them. */
export function isInstant(spec: SplitSpec): boolean {
  return spec.mode !== 'size';
}

/** Page groups for the modes that need no measuring. */
export function groupsFor(
  spec: Exclude<SplitSpec, { mode: 'size' }>,
  pages: readonly PageRef[],
  outlines: Readonly<Record<string, readonly OutlineEntry[]>>,
): Result<PageGroup[], SplitError> {
  if (spec.mode === 'every') return splitEveryN(pages, spec.count);
  if (spec.mode === 'ranges') {
    const ranges = parseRanges(spec.text, pages.length);
    return ranges.ok
      ? splitByRanges(pages, ranges.value, spec.keepRest ? 'group' : 'ignore')
      : err({ kind: 'ranges', problem: ranges.error });
  }
  const bookmarks = new Map<string, string>();
  for (const [sourceId, entries] of Object.entries(outlines)) {
    for (const [key, title] of bookmarksFromOutline(sourceId, entries, spec.level))
      bookmarks.set(key, title);
  }
  return splitByBookmarks(pages, bookmarks);
}

/** How many bookmarks of the files in the workspace point at its pages: 0 means "by bookmarks" has nothing to cut at. */
export function usableBookmarks(
  pages: readonly PageRef[],
  outlines: Readonly<Record<string, readonly OutlineEntry[]>>,
  level: number,
): number {
  const marks = new Set<string>();
  for (const [sourceId, entries] of Object.entries(outlines)) {
    for (const key of bookmarksFromOutline(sourceId, entries, level).keys()) marks.add(key);
  }
  return pages.filter(
    (page) => page.kind === 'original' && marks.has(bookmarkKey(page.sourceId, page.sourceIndex)),
  ).length;
}

export type SplitKind = SplitSpec['mode'];
export type SizeUnit = 'KB' | 'MB';

/** Everything the split form holds, kept outside the dialog so "Split here" can fill it in. */
export interface SplitDraft {
  readonly kind: SplitKind;
  readonly ranges: string;
  readonly keepRest: boolean;
  readonly every: number;
  readonly level: number;
  readonly sizeValue: number;
  readonly sizeUnit: SizeUnit;
}

export const defaultSplitDraft: SplitDraft = {
  kind: 'every',
  ranges: '',
  keepRest: true,
  every: 10,
  level: 1,
  sizeValue: 10,
  sizeUnit: 'MB',
};

const UNIT_BYTES: Record<SizeUnit, number> = { KB: 1024, MB: 1024 * 1024 };

/** What the form currently asks for. Numbers that make no sense are passed on as they are; the planners report them. */
export function specFromDraft(draft: SplitDraft): SplitSpec {
  switch (draft.kind) {
    case 'ranges':
      return { mode: 'ranges', text: draft.ranges, keepRest: draft.keepRest };
    case 'every':
      return { mode: 'every', count: draft.every };
    case 'bookmarks':
      return { mode: 'bookmarks', level: draft.level };
    case 'size':
      return { mode: 'size', limitBytes: draft.sizeValue * UNIT_BYTES[draft.sizeUnit] };
  }
}

export function sameSpec(a: SplitSpec, b: SplitSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** "Split here": two files, the pages up to the chosen one and everything after it. */
export function splitHereDraft(position: number, total: number): SplitDraft {
  return {
    ...defaultSplitDraft,
    kind: 'ranges',
    ranges: `1-${String(position)}, ${String(position + 1)}-${String(total)}`,
    keepRest: false,
  };
}
