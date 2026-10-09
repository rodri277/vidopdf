import type { OutlineEntry } from '../ports';
import { bookmarkKey } from './groups';

/**
 * Turns the outline of one file into the page-to-title map `splitByBookmarks` uses. Only entries
 * down to `maxLevel` count (1 is the top level). When several point at the same page the first
 * one wins, so a page always has a single title.
 */
export function bookmarksFromOutline(
  sourceId: string,
  entries: readonly OutlineEntry[],
  maxLevel = 1,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.level > maxLevel) continue;
    const title = entry.title.trim();
    const key = bookmarkKey(sourceId, entry.pageIndex);
    if (title !== '' && !map.has(key)) map.set(key, title);
  }
  return map;
}

/** Deepest level in an outline, so the UI knows whether to offer a choice of level. */
export function outlineDepth(entries: readonly OutlineEntry[]): number {
  return entries.reduce((deepest, entry) => Math.max(deepest, entry.level), 0);
}
