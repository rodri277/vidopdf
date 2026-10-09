import { parseRanges } from '../split/ranges';
import type { Stamp } from './stamp';

/** Whether a stamp goes on a page. `pageIndex` is zero-based inside the output file. */
export function stampAppliesTo(stamp: Stamp, pageIndex: number, total: number): boolean {
  if (stamp.skipFirst && pageIndex === 0) return false;
  const number = pageIndex + 1;
  switch (stamp.pages.kind) {
    case 'all':
      return true;
    case 'odd':
      return number % 2 === 1;
    case 'even':
      return number % 2 === 0;
    case 'ranges': {
      const ranges = parseRanges(stamp.pages.text, total);
      return ranges.ok && ranges.value.some((range) => number >= range.from && number <= range.to);
    }
  }
}

/** The stamps of a page, in the order they were added (later ones are drawn on top). */
export function stampsFor(stamps: readonly Stamp[], pageIndex: number, total: number): Stamp[] {
  return stamps.filter((stamp) => stampAppliesTo(stamp, pageIndex, total));
}
