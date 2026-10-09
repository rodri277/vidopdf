import { describe, expect, it } from 'vitest';
import type { ExportPage } from '@vidopdf/core';
import { createPdfLibWriter } from './pdflib-writer';
import { fixture } from './testing/fixtures';
import { differingPixels, renderPage } from './testing/render';

const writer = createPdfLibWriter();
const sources = new Map([
  ['a', fixture('mixed-sizes-3p.pdf')],
  ['b', fixture('rotated-2p.pdf')],
  ['i', fixture('images-2p.pdf')],
]);
// Tolerance: a differing pixel is one whose channel differs by more than 8/255, and at most 0.01 %
// of them are allowed. The last test proves this is tight enough to notice a changed text label.
const MAX_DIFFERING = 0.0001;

async function assembled(pages: readonly ExportPage[]): Promise<Uint8Array> {
  const result = await writer.assemble(sources, pages);
  if (!result.ok) throw new Error(`assemble failed: ${result.error.kind}`);
  return result.value;
}

describe('rendering of the exported PDF', () => {
  it('matches the source pages after reordering across files', async () => {
    const order: ExportPage[] = [
      { kind: 'original', sourceId: 'i', pageIndex: 1, rotation: 0 },
      { kind: 'original', sourceId: 'b', pageIndex: 0, rotation: 0 },
      { kind: 'original', sourceId: 'a', pageIndex: 2, rotation: 0 },
      { kind: 'original', sourceId: 'a', pageIndex: 0, rotation: 0 },
    ];
    const out = await assembled(order);
    for (const [index, page] of order.entries()) {
      if (page.kind !== 'original') continue;
      const expected = await renderPage(
        sources.get(page.sourceId) ?? new Uint8Array(),
        page.pageIndex + 1,
      );
      const actual = await renderPage(out, index + 1);
      expect(differingPixels(actual, expected), `page ${String(index + 1)}`).toBeLessThanOrEqual(
        MAX_DIFFERING,
      );
    }
  });

  it('matches the source page turned by the requested rotation', async () => {
    const out = await assembled([{ kind: 'original', sourceId: 'a', pageIndex: 1, rotation: 270 }]);
    const expected = await renderPage(sources.get('a') ?? new Uint8Array(), 2, { rotation: 270 });
    expect(differingPixels(await renderPage(out, 1), expected)).toBeLessThanOrEqual(MAX_DIFFERING);
  });

  it('keeps pictures intact (PNG and JPEG pages)', async () => {
    const out = await assembled([
      { kind: 'original', sourceId: 'i', pageIndex: 0, rotation: 0 },
      { kind: 'original', sourceId: 'i', pageIndex: 1, rotation: 0 },
    ]);
    for (const page of [1, 2]) {
      const expected = await renderPage(sources.get('i') ?? new Uint8Array(), page);
      expect(differingPixels(await renderPage(out, page), expected)).toBeLessThanOrEqual(
        MAX_DIFFERING,
      );
    }
  });

  it('renders a blank page as plain white', async () => {
    const out = await assembled([{ kind: 'blank', width: 200, height: 100, rotation: 0 }]);
    const raster = await renderPage(out, 1, { scale: 1 });
    expect([raster.width, raster.height]).toEqual([200, 100]);
    expect(raster.data.every((value) => value === 255)).toBe(true);
  });

  it('detects a real difference, so the comparison cannot pass by accident', async () => {
    const a = await renderPage(sources.get('a') ?? new Uint8Array(), 1);
    const b = await renderPage(sources.get('b') ?? new Uint8Array(), 1);
    expect(differingPixels(a, b)).toBeGreaterThan(MAX_DIFFERING);
  });
});
