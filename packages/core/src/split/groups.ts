import { err, ok } from '../result';
import type { Result } from '../result';
import type { PageRef } from '../workspace/page-ref';
import type { SplitError } from './errors';
import type { PageRange } from './ranges';

/** How a group came about; the file name follows from it. */
export type GroupKind = 'range' | 'rest' | 'part' | 'bookmark';

/** Pages that become one output file. */
export interface PageGroup {
  readonly kind: GroupKind;
  readonly pages: readonly PageRef[];
  /** The bookmark that opens the group, when there is one. */
  readonly title?: string;
  /** The positions (1-based, in the document being split) a range group covers. */
  readonly span?: PageRange;
}

/** Key that ties a bookmark to a page of a source file. */
export function bookmarkKey(sourceId: string, sourceIndex: number): string {
  return `${sourceId}:${String(sourceIndex)}`;
}

function nonEmpty(groups: PageGroup[]): Result<PageGroup[], SplitError> {
  return groups.length === 0 ? err({ kind: 'noPages' }) : ok(groups);
}

/**
 * One group per range, in the order given. Pages the ranges leave out are dropped, or collected
 * into one extra group with `rest: 'group'`. A page named by two ranges appears in both groups.
 */
export function splitByRanges(
  pages: readonly PageRef[],
  ranges: readonly PageRange[],
  rest: 'ignore' | 'group' = 'ignore',
): Result<PageGroup[], SplitError> {
  const used = new Set<number>();
  const groups: PageGroup[] = [];
  for (const range of ranges) {
    const from = Math.max(1, range.from);
    const to = Math.min(pages.length, range.to);
    if (from > to) continue;
    for (let position = from; position <= to; position++) used.add(position);
    groups.push({ kind: 'range', pages: pages.slice(from - 1, to), span: { from, to } });
  }
  const leftover = pages.filter((_, index) => !used.has(index + 1));
  if (rest === 'group' && leftover.length > 0) groups.push({ kind: 'rest', pages: leftover });
  return nonEmpty(groups);
}

/** Consecutive groups of `count` pages; the last one takes what remains. */
export function splitEveryN(
  pages: readonly PageRef[],
  count: number,
): Result<PageGroup[], SplitError> {
  if (!Number.isInteger(count) || count < 1) return err({ kind: 'invalidCount' });
  const groups: PageGroup[] = [];
  for (let start = 0; start < pages.length; start += count) {
    const end = Math.min(pages.length, start + count);
    groups.push({
      kind: 'part',
      pages: pages.slice(start, end),
      span: { from: start + 1, to: end },
    });
  }
  return nonEmpty(groups);
}

/**
 * Starts a new group at every page that has a title in `bookmarks`. Pages before the first
 * bookmark form a leading group of their own, so no page is ever dropped.
 */
export function splitByBookmarks(
  pages: readonly PageRef[],
  bookmarks: ReadonlyMap<string, string>,
): Result<PageGroup[], SplitError> {
  const groups: { kind: GroupKind; title?: string; pages: PageRef[] }[] = [];
  for (const page of pages) {
    const title =
      page.kind === 'original'
        ? bookmarks.get(bookmarkKey(page.sourceId, page.sourceIndex))
        : undefined;
    const current = groups.at(-1);
    if (title !== undefined) groups.push({ kind: 'bookmark', title, pages: [page] });
    else if (current === undefined) groups.push({ kind: 'part', pages: [page] });
    else current.pages.push(page);
  }
  return nonEmpty(groups);
}

/** Positions (1-based) of the pages that have a bookmark, for telling the user how many files come out. */
export function bookmarkedPositions(
  pages: readonly PageRef[],
  bookmarks: ReadonlyMap<string, string>,
): number[] {
  return pages.flatMap((page, index) =>
    page.kind === 'original' && bookmarks.has(bookmarkKey(page.sourceId, page.sourceIndex))
      ? [index + 1]
      : [],
  );
}
