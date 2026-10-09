import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { settingsFor } from '@vidopdf/core';
import type { CompressionPreset } from '@vidopdf/core';
import { createCompressor } from '@vidopdf/pdf-adapters';
import { differingPixels, nodeCodec, renderPage } from '@vidopdf/pdf-adapters/testing';
import { median, round } from '../stats';
import { ensureCorpus } from './corpus';

/**
 * The Phase 3 compression spike: how much does each strategy save on the corpus, and how much
 * does the picture change? Writes benchmarks/COMPRESSION.md. Run with `pnpm --filter
 * @vidopdf/benchmarks measure:compression`.
 */
const out = join(dirname(fileURLToPath(import.meta.url)), '../../COMPRESSION.md');
const PRESETS: readonly CompressionPreset[] = ['screen', 'balanced', 'print'];

/** Mean absolute difference per channel (0 to 255) between two renders of the same page. */
async function meanError(a: Uint8Array, b: Uint8Array, page: number): Promise<number> {
  const first = await renderPage(a, page, { scale: 1.4 });
  const second = await renderPage(b, page, { scale: 1.4 });
  if (first.width !== second.width || first.height !== second.height) return 255;
  let total = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    total +=
      Math.abs((first.data[index] ?? 0) - (second.data[index] ?? 0)) +
      Math.abs((first.data[index + 1] ?? 0) - (second.data[index + 1] ?? 0)) +
      Math.abs((first.data[index + 2] ?? 0) - (second.data[index + 2] ?? 0));
  }
  return total / (first.width * first.height * 3);
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  return (await PDFDocument.load(bytes)).getPageCount();
}

interface Row {
  readonly name: string;
  readonly strategy: string;
  readonly preset: string;
  readonly before: number;
  readonly after: number;
  readonly saved: number;
  readonly error: number;
  readonly differing: number;
  readonly ms: number;
  readonly recompressed: string;
}

const strategies = [
  {
    name: 'quality only (no resizing)',
    make: () =>
      createCompressor(nodeCodec, {
        settings: (preset) => ({ ...settingsFor(preset), targetDpi: 100_000 }),
        objectStreams: false,
      }),
  },
  {
    name: 'resize and quality, plain structure',
    make: () => createCompressor(nodeCodec, { objectStreams: false }),
  },
  {
    name: 'resize and quality, object streams',
    make: () => createCompressor(nodeCodec, { objectStreams: true }),
  },
] as const;

test(
  'measure the corpus',
  async () => {
    const corpus = await ensureCorpus();
    const rows: Row[] = [];
    for (const entry of corpus) {
      const original = new Uint8Array(readFileSync(entry.path));
      const pages = await pageCount(original);
      for (const strategy of strategies) {
        for (const preset of PRESETS) {
          const started = performance.now();
          const result = await strategy.make().compress(original, preset);
          const ms = performance.now() - started;
          if (!result.ok) throw new Error(`${entry.name}: ${result.error.kind}`);
          const compressed = result.value.bytes;
          const errors: number[] = [];
          const differing: number[] = [];
          for (let page = 1; page <= Math.min(pages, 3); page++) {
            errors.push(await meanError(original, compressed, page));
            differing.push(
              differingPixels(
                await renderPage(original, page, { scale: 1.4 }),
                await renderPage(compressed, page, { scale: 1.4 }),
                24,
              ),
            );
          }
          rows.push({
            name: entry.name,
            strategy: strategy.name,
            preset,
            before: original.byteLength,
            after: compressed.byteLength,
            saved: 1 - compressed.byteLength / original.byteLength,
            error: Math.max(...errors),
            differing: Math.max(...differing),
            ms,
            recompressed: `${String(result.value.report.imagesRecompressed)}/${String(result.value.report.imagesFound)}`,
          });
          expect(compressed.byteLength).toBeLessThanOrEqual(original.byteLength);
        }
      }
    }

    const kb = (bytes: number) => `${String(Math.round(bytes / 1024))} KB`;
    const lines = [
      '# Compression spike',
      '',
      'Measured by `pnpm --filter @vidopdf/benchmarks measure:compression` on synthetic photographs (see `src/compression/corpus.ts`); real photographs may compress differently. "Error" is the mean absolute difference per colour channel (0 to 255) between renders of the original and of the compressed file at about 100 dpi, worst of the first three pages; "pixels over 24" is the share of pixels that differ by more than 24 levels in some channel.',
      '',
      '## Corpus',
      '',
      ...corpus.map(
        (c) => `- **${c.name}**${c.photographic ? ' (photographic)' : ''}: ${c.description}`,
      ),
      '',
      '## Median saving on the photographic cases',
      '',
      '| Strategy | screen | balanced | print |',
      '| --- | --- | --- | --- |',
      ...strategies.map((s) => {
        const cells = PRESETS.map((preset) => {
          const values = rows
            .filter(
              (r) =>
                r.strategy === s.name &&
                r.preset === preset &&
                corpus.find((c) => c.name === r.name)?.photographic === true,
            )
            .map((r) => r.saved);
          return `${String(round(median(values) * 100))} %`;
        });
        return `| ${s.name} | ${cells.join(' | ')} |`;
      }),
      '',
      '## Every case',
      '',
      '| Case | Strategy | Preset | Before | After | Saved | Error | Pixels over 24 | Time | Pictures recompressed |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(
        (r) =>
          `| ${r.name} | ${r.strategy} | ${r.preset} | ${kb(r.before)} | ${kb(r.after)} | ${String(round(r.saved * 100))} % | ${String(round(r.error, 2))} | ${String(round(r.differing * 100, 2))} % | ${String(Math.round(r.ms))} ms | ${r.recompressed} |`,
      ),
      '',
    ];
    writeFileSync(out, lines.join('\n'));
  },
  30 * 60_000,
);
