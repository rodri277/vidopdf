import { err, ok } from '../result';
import type { Result } from '../result';
import type { PageRef } from '../workspace/page-ref';
import type { SplitError } from './errors';
import type { PageGroup } from './groups';

/** The real size in bytes of the PDF those pages would make. Supplied by the export worker. */
export type MeasureGroup = (pages: readonly PageRef[]) => Promise<number>;

export interface SizedGroup extends PageGroup {
  /** Measured size of this group, never above the limit. */
  readonly size: number;
}

export interface SizeSplitOptions {
  readonly signal?: AbortSignal;
  /** Pages already placed in a group, and the total. */
  readonly onProgress?: (done: number, total: number) => void;
}

class Stop extends Error {
  constructor(readonly error: SplitError) {
    super(error.kind);
  }
}

/**
 * Cuts the pages into the fewest consecutive groups whose measured size stays within `limit`,
 * filling each one as far as it goes. Size is measured, not estimated: every candidate group is
 * really built by `measure`. Growing by doubling and then bisecting keeps the number of
 * measurements near log2(group length) per group. If a single page is already over the limit, no
 * split can work and the error says which page.
 */
export async function splitBySize(
  pages: readonly PageRef[],
  limit: number,
  measure: MeasureGroup,
  options: SizeSplitOptions = {},
): Promise<Result<SizedGroup[], SplitError>> {
  if (!Number.isFinite(limit) || limit <= 0) return err({ kind: 'invalidLimit' });
  if (pages.length === 0) return err({ kind: 'noPages' });
  const sizes = new Map<string, number>();

  const sizeOf = async (start: number, end: number): Promise<number> => {
    if (options.signal?.aborted === true) throw new Stop({ kind: 'cancelled' });
    const key = `${String(start)}-${String(end)}`;
    const known = sizes.get(key);
    if (known !== undefined) return known;
    try {
      const size = await measure(pages.slice(start, end + 1));
      sizes.set(key, size);
      return size;
    } catch (error) {
      throw new Stop({
        kind: 'measureFailed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** Last index (from `start`) whose group still fits. Assumes more pages never make a PDF smaller. */
  const furthestFit = async (start: number): Promise<number> => {
    const first = await sizeOf(start, start);
    if (first > limit)
      throw new Stop({ kind: 'pageTooLarge', pageNumber: start + 1, size: first, limit });
    let fits = start;
    let step = 1;
    let breaks = -1;
    while (breaks < 0 && fits < pages.length - 1) {
      const probe = Math.min(pages.length - 1, fits + step);
      if ((await sizeOf(start, probe)) <= limit) {
        fits = probe;
        step *= 2;
      } else {
        breaks = probe;
      }
    }
    while (breaks >= 0 && breaks - fits > 1) {
      const middle = Math.floor((fits + breaks) / 2);
      if ((await sizeOf(start, middle)) <= limit) fits = middle;
      else breaks = middle;
    }
    return fits;
  };

  try {
    const groups: SizedGroup[] = [];
    for (let start = 0; start < pages.length;) {
      const end = await furthestFit(start);
      const size = await sizeOf(start, end);
      groups.push({
        kind: 'part',
        pages: pages.slice(start, end + 1),
        span: { from: start + 1, to: end + 1 },
        size,
      });
      start = end + 1;
      options.onProgress?.(start, pages.length);
    }
    return ok(groups);
  } catch (error) {
    if (error instanceof Stop) return err(error.error);
    throw error;
  }
}
