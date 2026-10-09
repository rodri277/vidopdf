import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { PageRef } from '../workspace/page-ref';
import { original } from '../test-helpers';
import { splitBySize } from './by-size';
import type { MeasureGroup } from './by-size';

const OVERHEAD = 100;

/** Pages with a made-up weight each; a group weighs its pages plus a fixed overhead. */
function setup(weights: readonly number[]) {
  const pages: PageRef[] = weights.map((_, i) => original(`p${String(i)}`, 's', i));
  const weight = new Map(pages.map((page, i) => [page.id, weights[i] ?? 0]));
  const measure = vi.fn<MeasureGroup>((group) =>
    Promise.resolve(OVERHEAD + group.reduce((sum, page) => sum + (weight.get(page.id) ?? 0), 0)),
  );
  return { pages, measure };
}

const ok = async (promise: ReturnType<typeof splitBySize>) => {
  const result = await promise;
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('splitBySize', () => {
  it('fills each file as far as the limit allows', async () => {
    const { pages, measure } = setup([40, 40, 40, 40, 40, 40, 40]);
    const groups = await ok(splitBySize(pages, 300, measure)); // room for 5 pages of 40 plus overhead
    expect(groups.map((g) => g.pages.length)).toEqual([5, 2]);
    expect(groups.map((g) => g.size)).toEqual([300, 180]);
  });

  it('keeps everything in one file when it all fits', async () => {
    const { pages, measure } = setup([10, 10, 10]);
    const groups = await ok(splitBySize(pages, 10_000, measure));
    expect(groups).toHaveLength(1);
  });

  it('fails, naming the page, when one page alone is over the limit', async () => {
    const { pages, measure } = setup([10, 10, 900, 10]);
    expect(await splitBySize(pages, 500, measure)).toEqual({
      ok: false,
      error: { kind: 'pageTooLarge', pageNumber: 3, size: 1000, limit: 500 },
    });
  });

  it('rejects a limit that is not a positive number, and an empty document', async () => {
    const { pages, measure } = setup([1]);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await splitBySize(pages, bad, measure)).toEqual({
        ok: false,
        error: { kind: 'invalidLimit' },
      });
    }
    expect(await splitBySize([], 100, measure)).toEqual({ ok: false, error: { kind: 'noPages' } });
  });

  it('stops when cancelled', async () => {
    const { pages, measure } = setup([1, 1, 1]);
    const controller = new AbortController();
    controller.abort();
    expect(await splitBySize(pages, 1000, measure, { signal: controller.signal })).toEqual({
      ok: false,
      error: { kind: 'cancelled' },
    });
    expect(measure).not.toHaveBeenCalled();
  });

  it('reports a measurement that fails instead of throwing', async () => {
    const { pages } = setup([1, 1]);
    const broken: MeasureGroup = () => Promise.reject(new Error('worker died'));
    expect(await splitBySize(pages, 1000, broken)).toEqual({
      ok: false,
      error: { kind: 'measureFailed', detail: 'worker died' },
    });
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection is the case under test
    const odd: MeasureGroup = () => Promise.reject('plain text');
    expect(await splitBySize(pages, 1000, odd)).toEqual({
      ok: false,
      error: { kind: 'measureFailed', detail: 'plain text' },
    });
  });

  it('reports progress as pages are placed', async () => {
    const { pages, measure } = setup([40, 40, 40, 40]);
    const seen: [number, number][] = [];
    await splitBySize(pages, 220, measure, {
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [3, 4],
      [4, 4],
    ]);
  });

  it('every file respects the limit, nothing is lost or repeated, and no file could take one more page', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 90 }), { minLength: 1, maxLength: 80 }),
        fc.integer({ min: 200, max: 1200 }),
        async (weights, limit) => {
          const { pages, measure } = setup(weights);
          const groups = await ok(splitBySize(pages, limit, measure));
          expect(groups.flatMap((g) => g.pages.map((p) => p.id))).toEqual(pages.map((p) => p.id));
          for (const [index, group] of groups.entries()) {
            expect(group.size).toBeLessThanOrEqual(limit);
            const next = groups[index + 1]?.pages[0];
            if (next !== undefined) {
              expect(await measure([...group.pages, next])).toBeGreaterThan(limit);
            }
          }
        },
      ),
    );
  });

  it('measures about log2(length) times per file, not once per page', async () => {
    const weights = Array.from({ length: 512 }, () => 1);
    const { pages, measure } = setup(weights);
    const groups = await ok(splitBySize(pages, OVERHEAD + 64, measure)); // 64 pages per file, 8 files
    expect(groups).toHaveLength(8);
    expect(measure.mock.calls.length).toBeLessThan(groups.length * 20);
    expect(measure.mock.calls.length).toBeLessThan(pages.length / 3);
  });
});
