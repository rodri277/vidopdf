import { describe, expect, it } from 'vitest';
import { readOutline } from './outline';
import type { OutlineNode, OutlineSource } from './outline';
import { fixture } from './testing/fixtures';
import { nodePdfjs } from './testing/pdfjs-node';

async function outlineOf(name: string) {
  const task = nodePdfjs.getDocument({ data: fixture(name).slice() });
  try {
    const doc = await task.promise;
    return await readOutline(doc);
  } finally {
    await task.destroy();
  }
}

describe('readOutline on real files', () => {
  it('reads a simple outline', async () => {
    expect(await outlineOf('bookmarks-3p.pdf')).toEqual({
      ok: true,
      value: [
        { title: 'Chapter 1', pageIndex: 0, level: 1 },
        { title: 'Chapter 2', pageIndex: 1, level: 1 },
        { title: 'Chapter 3', pageIndex: 2, level: 1 },
      ],
    });
  });

  it('resolves direct and named destinations, keeps levels, and skips entries that lead nowhere', async () => {
    expect(await outlineOf('bookmarks-nested-6p.pdf')).toEqual({
      ok: true,
      value: [
        { title: 'Part A', pageIndex: 0, level: 1 },
        { title: 'A.1', pageIndex: 1, level: 2 },
        { title: 'A.2', pageIndex: 2, level: 2 },
        { title: 'Part B', pageIndex: 3, level: 1 },
        { title: 'B.1', pageIndex: 4, level: 2 },
        { title: 'Part C', pageIndex: 5, level: 1 },
      ],
    });
  });

  it('finds nothing in a document without bookmarks', async () => {
    expect(await outlineOf('single-1p.pdf')).toEqual({ ok: true, value: [] });
  });
});

describe('readOutline on awkward input', () => {
  const source = (
    nodes: OutlineNode[] | null,
    overrides: Partial<OutlineSource> = {},
  ): OutlineSource => ({
    getOutline: () => Promise.resolve(nodes),
    getDestination: () => Promise.resolve(null),
    getPageIndex: () => Promise.resolve(0),
    ...overrides,
  });
  const ref = { num: 1, gen: 0 };

  it('accepts a page given as a plain number, and refuses a negative or fractional one', async () => {
    const result = await readOutline(
      source([
        { title: 'ok', dest: [3, { name: 'Fit' }] },
        { title: 'negative', dest: [-1] },
        { title: 'fraction', dest: [1.5] },
      ]),
    );
    expect(result).toEqual({ ok: true, value: [{ title: 'ok', pageIndex: 3, level: 1 }] });
  });

  it('drops a named destination that does not exist and a destination of the wrong shape', async () => {
    const result = await readOutline(
      source([
        { title: 'named', dest: 'ghost' },
        { title: 'odd', dest: [{ not: 'a ref' }] },
        { title: 'empty', dest: [] },
        { title: 'text', dest: 42 },
      ]),
    );
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('keeps going when one entry cannot be resolved', async () => {
    let calls = 0;
    const result = await readOutline(
      source(
        [
          { title: 'bad', dest: [ref] },
          { title: 'good', dest: [ref] },
        ],
        {
          getPageIndex: () => {
            calls++;
            return calls === 1 ? Promise.reject(new Error('no such page')) : Promise.resolve(7);
          },
        },
      ),
    );
    expect(result).toEqual({ ok: true, value: [{ title: 'good', pageIndex: 7, level: 1 }] });
  });

  it('treats a missing outline as empty and reports a failing reader as a damaged file', async () => {
    expect(await readOutline(source(null))).toEqual({ ok: true, value: [] });
    const broken = await readOutline(
      source(null, { getOutline: () => Promise.reject(new Error('boom')) }),
    );
    expect(broken).toMatchObject({ ok: false, error: { kind: 'corrupt', detail: 'boom' } });
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection is the case under test
    const odd = await readOutline(source(null, { getOutline: () => Promise.reject('text') }));
    expect(odd).toMatchObject({ ok: false, error: { detail: 'text' } });
  });

  it('stops descending after 32 levels instead of recursing forever', async () => {
    let node: OutlineNode = { title: 'leaf', dest: [ref] };
    for (let level = 0; level < 100; level++)
      node = { title: `n${String(level)}`, dest: [ref], items: [node] };
    const result = await readOutline(source([node]));
    if (!result.ok) throw new Error('unexpected');
    expect(result.value).toHaveLength(32);
    expect(result.value.at(-1)?.level).toBe(32);
  });

  it('caps the number of entries read from a huge outline', async () => {
    const many = Array.from({ length: 12_000 }, (_, i) => ({
      title: `t${String(i)}`,
      dest: [ref],
    }));
    const result = await readOutline(source(many));
    if (!result.ok) throw new Error('unexpected');
    expect(result.value).toHaveLength(10_000);
  });
});
