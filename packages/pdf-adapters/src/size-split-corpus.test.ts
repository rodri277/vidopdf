import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splitBySize } from '@vidopdf/core';
import type { ExportPage, PageRef } from '@vidopdf/core';
import { createPdfLibWriter } from './pdflib-writer';
import { fixture } from './testing/fixtures';

/**
 * SPEC, Phase 2: splitting by maximum size respects the limit in 100 % of the corpus cases, or
 * fails with a message that explains why a single page exceeds it. Every readable PDF of the
 * corpus is split with limits from far too small to larger than the file.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/generated');
const writer = createPdfLibWriter();

const toExport = (page: PageRef): ExportPage =>
  page.kind === 'original'
    ? {
        kind: 'original',
        sourceId: page.sourceId,
        pageIndex: page.sourceIndex,
        rotation: page.rotation,
      }
    : { kind: 'blank', width: page.width, height: page.height, rotation: page.rotation };

async function sizeOf(
  sources: ReadonlyMap<string, Uint8Array>,
  pages: readonly PageRef[],
): Promise<number> {
  const built = await writer.assemble(sources, pages.map(toExport));
  if (!built.ok) throw new Error(`assemble failed: ${built.error.kind}`);
  return built.value.byteLength;
}

async function readableCorpus() {
  const readable: { name: string; bytes: Uint8Array; pageCount: number }[] = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.pdf'))) {
    const bytes = fixture(name);
    const info = await writer.inspect(bytes);
    if (info.ok) readable.push({ name, bytes, pageCount: info.value.pageCount });
  }
  return readable;
}

describe('split by size over the whole corpus', () => {
  it('holds the limit for every file and every limit, or names the page that cannot fit', async () => {
    const corpus = await readableCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(10);
    let succeeded = 0;
    let refused = 0;
    for (const { name, bytes, pageCount } of corpus) {
      const sources = new Map([['f', bytes]]);
      const pages: PageRef[] = Array.from({ length: pageCount }, (_, sourceIndex) => ({
        kind: 'original',
        id: `${name}-${String(sourceIndex)}`,
        sourceId: 'f',
        sourceIndex,
        rotation: 0,
      }));
      const whole = await sizeOf(sources, pages);
      for (const limit of [200, 1500, 3000, 12_000, Math.floor(whole / 3), whole, whole * 2]) {
        const where = `${name} at ${String(limit)} bytes`;
        const result = await splitBySize(pages, limit, (group) => sizeOf(sources, group));
        if (result.ok) {
          succeeded++;
          expect(
            result.value.flatMap((g) => g.pages),
            where,
          ).toEqual(pages);
          for (const group of result.value)
            expect(await sizeOf(sources, group.pages), where).toBeLessThanOrEqual(limit);
        } else {
          refused++;
          expect(result.error.kind, where).toBe('pageTooLarge');
          if (result.error.kind !== 'pageTooLarge') continue;
          // The message must be true: that page really is over the limit on its own.
          const page = pages[result.error.pageNumber - 1];
          expect(await sizeOf(sources, page ? [page] : []), where).toBeGreaterThan(limit);
          expect(result.error.size).toBeGreaterThan(limit);
        }
      }
    }
    // The sweep must exercise both outcomes, or it proves nothing.
    expect(succeeded).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(5);
  });
});
