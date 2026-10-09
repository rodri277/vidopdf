// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import type { ExportPage, PageRef } from '@vidopdf/core';
import { createPdfLibWriter } from '@vidopdf/pdf-adapters/pdf-lib';
import { createZipBuilder } from '@vidopdf/pdf-adapters/zip';
import { createExportCore } from './export-core';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../../tests/fixtures/generated');
const fixture = (name: string) => new Uint8Array(readFileSync(join(dir, name)));
const writer = createPdfLibWriter();
/** Reopens the output with the writer's own validator: the number of pages it really holds. */
const pageCount = async (bytes: Uint8Array): Promise<number> => {
  const info = await writer.inspect(bytes);
  if (!info.ok) throw new Error(`not a valid PDF: ${info.error.kind}`);
  return info.value.pageCount;
};

const original = (
  sourceId: string,
  pageIndex: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): ExportPage => ({
  kind: 'original',
  sourceId,
  pageIndex,
  rotation,
});
const range = (sourceId: string, count: number): ExportPage[] =>
  Array.from({ length: count }, (_, i) => original(sourceId, i));

async function setup(
  files: Record<string, string> = { a: 'mixed-sizes-3p.pdf', b: 'rotated-2p.pdf' },
) {
  const core = createExportCore({
    writer: createPdfLibWriter(),
    createZip: () => createZipBuilder(),
  });
  for (const [id, name] of Object.entries(files)) {
    const registered = await core.register(id, fixture(name));
    if (!registered.ok) throw new Error(`could not register ${name}`);
  }
  return core;
}

const ignore = () => undefined;

describe('register', () => {
  it('keeps usable files and refuses damaged or protected ones without keeping them', async () => {
    const core = await setup({});
    expect(await core.register('ok', fixture('single-1p.pdf'))).toEqual({
      ok: true,
      value: { pageCount: 1 },
    });
    expect(await core.register('bad', fixture('truncated.pdf'))).toMatchObject({
      ok: false,
      error: { kind: 'corrupt' },
    });
    expect(await core.register('locked', fixture('encrypted-owner-restricted.pdf'))).toMatchObject({
      ok: false,
      error: { kind: 'encrypted' },
    });
    const result = await core.runPlan(
      1,
      [{ name: 'x.pdf', pages: [original('bad', 0)] }],
      'x.zip',
      ignore,
    );
    expect(result).toMatchObject({ ok: false });
  });
});

describe('runPlan', () => {
  it('builds a single PDF with its name and reports progress up to the total', async () => {
    const core = await setup();
    const progress: [number, number][] = [];
    const pages = [original('b', 1), ...range('a', 3)];
    const result = await core.runPlan(
      1,
      [{ name: 'merged.pdf', pages }],
      'unused.zip',
      (done, total) => progress.push([done, total]),
    );
    if (!result.ok) throw new Error('runPlan failed');
    expect(result.value).toMatchObject({
      kind: 'pdf',
      name: 'merged.pdf',
      mime: 'application/pdf',
      fileCount: 1,
      pageCount: 4,
    });
    expect(await pageCount(result.value.bytes)).toBe(4);
    expect(progress.at(-1)).toEqual([4, 4]);
    expect(progress.map(([done]) => done)).toEqual([1, 2, 3, 4]);
  });

  it('packs several outputs into a ZIP of valid PDFs, counting progress across all of them', async () => {
    const core = await setup();
    const progress: [number, number][] = [];
    const result = await core.runPlan(
      2,
      [
        { name: 'one.pdf', pages: range('a', 3) },
        { name: 'two.pdf', pages: range('b', 2) },
        { name: 'three.pdf', pages: [original('a', 2)] },
      ],
      'parts.zip',
      (done, total) => progress.push([done, total]),
    );
    if (!result.ok) throw new Error('runPlan failed');
    expect(result.value).toMatchObject({
      kind: 'zip',
      name: 'parts.zip',
      mime: 'application/zip',
      fileCount: 3,
      pageCount: 6,
    });
    const files = unzipSync(result.value.bytes);
    expect(Object.keys(files)).toEqual(['one.pdf', 'two.pdf', 'three.pdf']);
    expect(await Promise.all(Object.values(files).map(pageCount))).toEqual([3, 2, 1]);
    expect(progress.at(-1)).toEqual([6, 6]);
    expect(progress.every(([, total]) => total === 6)).toBe(true);
  });

  it('fails clearly for an unknown source or an empty plan', async () => {
    const core = await setup();
    expect(
      await core.runPlan(3, [{ name: 'x.pdf', pages: [original('ghost', 0)] }], 'x.zip', ignore),
    ).toMatchObject({
      ok: false,
      error: { kind: 'internal' },
    });
    expect(await core.runPlan(4, [], 'x.zip', ignore)).toMatchObject({
      ok: false,
      error: { kind: 'empty' },
    });
  });

  it('reports a duplicate output name instead of writing a broken archive', async () => {
    const core = await setup();
    const result = await core.runPlan(
      5,
      [
        { name: 'same.pdf', pages: range('a', 1) },
        { name: 'SAME.pdf', pages: range('a', 1) },
      ],
      'x.zip',
      ignore,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it('can be cancelled in the middle, returns nothing partial, and the next job is unaffected', async () => {
    const core = await setup({ big: 'pages-300.pdf', a: 'mixed-sizes-3p.pdf' });
    const outputs = [{ name: 'all.pdf', pages: range('big', 300) }];
    let cancelledAt = 0;
    const result = await core.runPlan(6, outputs, 'x.zip', (done) => {
      if (done === 20 && cancelledAt === 0) {
        cancelledAt = done;
        core.cancelJob(6);
      }
    });
    expect(result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    const next = await core.runPlan(7, [{ name: 'ok.pdf', pages: range('a', 3) }], 'x.zip', ignore);
    expect(next.ok).toBe(true);
  });

  it('stops before starting the next file of a ZIP once cancelled', async () => {
    const core = await setup();
    let seen = 0;
    const result = await core.runPlan(
      8,
      [
        { name: 'one.pdf', pages: range('a', 3) },
        { name: 'two.pdf', pages: range('b', 2) },
      ],
      'x.zip',
      () => {
        if (++seen === 1) core.cancelJob(8);
      },
    );
    expect(result).toMatchObject({ ok: false, error: { kind: 'cancelled' } });
  });

  it('ignores cancelling a job that is not running', async () => {
    const core = await setup();
    expect(() => {
      core.cancelJob(999);
    }).not.toThrow();
  });
});

describe('splitBySize', () => {
  const pagesOf = (sourceId: string, count: number): PageRef[] =>
    Array.from({ length: count }, (_, sourceIndex) => ({
      kind: 'original' as const,
      id: `${sourceId}${String(sourceIndex)}`,
      sourceId,
      sourceIndex,
      rotation: 0 as const,
    }));

  it('returns contiguous spans that cover every page, each really under the limit', async () => {
    const core = await setup({ big: 'pages-300.pdf' });
    const progress: number[] = [];
    const result = await core.splitBySize(1, pagesOf('big', 300), 40_000, (done) =>
      progress.push(done),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const spans = result.value;
    expect(spans[0]?.from).toBe(0);
    expect(spans.at(-1)?.to).toBe(299);
    spans.slice(1).forEach((span, i) => {
      expect(span.from).toBe((spans[i]?.to ?? -2) + 1);
    });
    expect(spans.every((span) => span.size <= 40_000)).toBe(true);
    expect(spans.length).toBeGreaterThan(2);
    expect(progress.at(-1)).toBe(300);
  });

  it('names the page that cannot fit', async () => {
    const core = await setup({ scan: 'scanned-2p.pdf' });
    expect(await core.splitBySize(2, pagesOf('scan', 2), 20_000, ignore)).toMatchObject({
      ok: false,
      error: { kind: 'pageTooLarge', pageNumber: 1 },
    });
  });

  it('can be cancelled', async () => {
    const core = await setup({ big: 'pages-300.pdf' });
    const result = await core.splitBySize(3, pagesOf('big', 300), 40_000, () => {
      core.cancelJob(3);
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'cancelled' } });
  });

  it('reports a source it does not have as a failed measurement', async () => {
    const core = await setup({});
    expect(await core.splitBySize(4, pagesOf('ghost', 2), 1000, ignore)).toMatchObject({
      ok: false,
      error: { kind: 'measureFailed' },
    });
  });
});

describe('registerImage', () => {
  const picture = (format: 'png' | 'jpeg' | 'webp') => {
    const canvas = createCanvas(200, 100);
    canvas.getContext('2d').fillRect(0, 0, 100, 100);
    const buffer =
      format === 'png'
        ? canvas.toBuffer('image/png')
        : format === 'jpeg'
          ? canvas.toBuffer('image/jpeg')
          : canvas.toBuffer('image/webp');
    return new Uint8Array(buffer);
  };
  const options = { paper: 'a4', orientation: 'auto', margin: 'small' } as const;

  it('turns a picture into a source, hands back a separate copy, and exports it like any page', async () => {
    const core = await setup({});
    const made = await core.registerImage('img', picture('png'), options);
    if (!made.ok) throw new Error('registerImage failed');
    expect(made.value.info).toEqual({ pageCount: 1 });
    expect(await pageCount(made.value.pdf)).toBe(1);
    made.value.pdf.fill(0); // the render worker may consume its copy without hurting ours
    const exported = await core.runPlan(
      1,
      [{ name: 'photo.pdf', pages: [original('img', 0)] }],
      'x.zip',
      ignore,
    );
    expect(exported.ok && (await pageCount(exported.value.bytes))).toBe(1);
  });

  it('refuses WebP and damaged pictures, and registers nothing', async () => {
    const core = await setup({});
    expect(await core.registerImage('w', picture('webp'), options)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported' },
    });
    expect(await core.registerImage('j', picture('jpeg').slice(0, 30), options)).toMatchObject({
      ok: false,
    });
    expect(
      await core.runPlan(1, [{ name: 'x.pdf', pages: [original('w', 0)] }], 'x.zip', ignore),
    ).toMatchObject({ ok: false });
  });
});

describe('release', () => {
  it('forgets a source', async () => {
    const core = await setup();
    core.release('a');
    expect(
      await core.runPlan(1, [{ name: 'x.pdf', pages: [original('a', 0)] }], 'x.zip', ignore),
    ).toMatchObject({ ok: false });
  });
});
