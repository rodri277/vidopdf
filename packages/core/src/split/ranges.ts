import { err, ok } from '../result';
import type { Result } from '../result';
import type { RangeProblem } from './errors';

/** A run of pages, 1-based and inclusive on both ends, as people write them. */
export interface PageRange {
  readonly from: number;
  readonly to: number;
}

const SINGLE = /^(\d+)$/;
const SPAN = /^(\d+)\s*-\s*(\d+)$/;
const OPEN = /^(\d+)\s*-$/;

function parseToken(token: string, pageCount: number): Result<PageRange, RangeProblem> {
  const span = SPAN.exec(token);
  const open = OPEN.exec(token);
  const single = SINGLE.exec(token);
  const match = span ?? open ?? single;
  if (match === null) return err({ kind: 'syntax', token });
  const from = Number(match[1]);
  const to = span !== null ? Number(span[2]) : open !== null ? pageCount : from;
  if (from === 0 || to === 0) return err({ kind: 'zero', token });
  if (from > to) return err({ kind: 'reversed', token });
  if (to > pageCount) return err({ kind: 'outOfRange', token, pageCount });
  return ok({ from, to });
}

/**
 * Reads "1-3, 5, 8-" (commas, semicolons or new lines between ranges; "8-" means to the last
 * page). The first problem found is reported with the text that caused it.
 */
export function parseRanges(text: string, pageCount: number): Result<PageRange[], RangeProblem> {
  const tokens = text
    .split(/[,;\n]/)
    .map((token) => token.trim())
    .filter((token) => token !== '');
  if (tokens.length === 0) return err({ kind: 'empty' });
  const ranges: PageRange[] = [];
  for (const token of tokens) {
    const parsed = parseToken(token, pageCount);
    if (!parsed.ok) return parsed;
    ranges.push(parsed.value);
  }
  return ok(ranges);
}

export function formatRange({ from, to }: PageRange): string {
  return from === to ? String(from) : `${String(from)}-${String(to)}`;
}

/** Folds sorted page numbers into the shortest list of ranges: [1,2,3,7] gives 1-3 and 7. */
export function toRanges(pages: readonly number[]): PageRange[] {
  const ranges: { from: number; to: number }[] = [];
  for (const page of pages) {
    const last = ranges.at(-1);
    if (last !== undefined && page === last.to + 1) last.to = page;
    else ranges.push({ from: page, to: page });
  }
  return ranges;
}

export interface RangeCoverage {
  /** Pages that appear in more than one range. */
  readonly repeated: readonly number[];
  /** Pages that appear in none. */
  readonly unassigned: readonly number[];
}

/** What a set of ranges leaves out and what it uses twice, so the user can be told before splitting. */
export function analyzeRanges(ranges: readonly PageRange[], pageCount: number): RangeCoverage {
  const uses = new Array<number>(pageCount + 1).fill(0);
  for (const { from, to } of ranges) {
    for (let page = from; page <= to; page++) uses[page] = (uses[page] ?? 0) + 1;
  }
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  return {
    repeated: pages.filter((page) => (uses[page] ?? 0) > 1),
    unassigned: pages.filter((page) => (uses[page] ?? 0) === 0),
  };
}
