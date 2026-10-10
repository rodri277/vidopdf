// @vitest-environment node
import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { NO_METADATA, err, ok, pdfError } from '@vidopdf/core';
import type { EncodedImage, ImageExportOptions, PdfRenderer, Rotation } from '@vidopdf/core';
import { createZipBuilder } from '@vidopdf/pdf-adapters/zip';
import type { ImageJobPage } from './api';
import { createRenderCore } from './render-core';

const png: ImageExportOptions = { format: 'png', dpi: 150, quality: 0.9 };

interface Call {
  pageIndex: number;
  rotation: Rotation | undefined;
}

function fakeRenderer(behaviour: { capped?: number[]; fail?: number; slow?: () => void } = {}) {
  const calls: Call[] = [];
  const trimmed = { count: 0 };
  const renderer: PdfRenderer<ImageBitmap> = {
    open: () => Promise.resolve(ok({ pageCount: 5 })),
    renderPage: (_index, width) =>
      Promise.resolve(
        ok({
          width,
          height: width,
          image: { close: () => undefined } as unknown as ImageBitmap,
          pointsWidth: 595,
          pointsHeight: 842,
        }),
      ),
    renderImage: (pageIndex, _options, _signal, rotation) => {
      calls.push({ pageIndex, rotation });
      behaviour.slow?.();
      if (pageIndex === behaviour.fail)
        return Promise.resolve(err(pdfError('corrupt', 'bad page')));
      const image: EncodedImage = {
        bytes: new Uint8Array([pageIndex, 7, 7]),
        width: 10,
        height: 20,
        dpi: 150,
        capped: behaviour.capped?.includes(pageIndex) ?? false,
      };
      return Promise.resolve(ok(image));
    },
    outline: () => Promise.resolve(ok([{ title: 'Intro', pageIndex: 0, level: 1 }])),
    metadata: () => Promise.resolve(ok({ ...NO_METADATA, title: 'Report' })),
    trim: () => {
      trimmed.count++;
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  };
  return { renderer, calls, trimmed };
}

function setup(
  behaviour: Parameters<typeof fakeRenderer>[0] = {},
  formats: readonly string[] = ['png', 'jpeg', 'webp'],
) {
  const made = fakeRenderer(behaviour);
  const encodeBlank = vi.fn(
    (
      width: number,
      height: number,
      rotation: Rotation,
    ): Promise<ReturnType<typeof ok<EncodedImage>>> =>
      Promise.resolve(
        ok({
          bytes: new Uint8Array([255, width, height, rotation]),
          width,
          height,
          dpi: 150,
          capped: false,
        }),
      ),
  );
  const core = createRenderCore({
    createRenderer: () => made.renderer,
    createZip: () => createZipBuilder(),
    encodeBlank,
    canEncode: (format) => Promise.resolve(formats.includes(format)),
  });
  return { core, encodeBlank, ...made };
}

const original = (pageIndex: number, rotation: Rotation = 0, sourceId = 's'): ImageJobPage => ({
  kind: 'original',
  sourceId,
  pageIndex,
  rotation,
});
const ignore = () => undefined;

describe('documents', () => {
  it('opens a source, draws its pages, reads its outline and forgets it', async () => {
    const { core } = setup();
    expect(await core.open('s', new Uint8Array(1))).toEqual({ ok: true, value: { pageCount: 5 } });
    expect(await core.render(1, 's', 0, 320)).toMatchObject({ ok: true, value: { width: 320 } });
    expect(await core.outline('s')).toEqual({
      ok: true,
      value: [{ title: 'Intro', pageIndex: 0, level: 1 }],
    });
    expect(await core.metadata('s')).toMatchObject({ ok: true, value: { title: 'Report' } });
    await core.release('s');
    expect(await core.render(2, 's', 0, 320)).toMatchObject({
      ok: false,
      error: { kind: 'internal' },
    });
    expect(await core.outline('s')).toMatchObject({ ok: false });
    expect(await core.metadata('s')).toMatchObject({ ok: false });
  });

  it('closes the renderer of a file that failed to open', async () => {
    const close = vi.fn(() => Promise.resolve());
    const core = createRenderCore({
      createRenderer: () => ({
        open: () => Promise.resolve(err(pdfError('corrupt'))),
        renderPage: vi.fn(),
        renderImage: vi.fn(),
        outline: vi.fn(),
        metadata: vi.fn(),
        trim: vi.fn(),
        close,
      }),
      createZip: () => createZipBuilder(),
      encodeBlank: vi.fn(),
      canEncode: () => Promise.resolve(true),
    });
    expect(await core.open('bad', new Uint8Array(1))).toMatchObject({ ok: false });
    expect(close).toHaveBeenCalledOnce();
    expect(await core.render(1, 'bad', 0, 100)).toMatchObject({ ok: false });
  });

  it('cancels a thumbnail request without failing for unknown ids', () => {
    const { core } = setup();
    expect(() => {
      core.cancel(12345);
    }).not.toThrow();
  });
});

describe('encodableFormats', () => {
  it('lists only what the browser can encode', async () => {
    expect(await setup({}, ['png', 'jpeg']).core.encodableFormats()).toEqual(['png', 'jpeg']);
    expect(await setup({}, []).core.encodableFormats()).toEqual([]);
  });
});

describe('exportImages', () => {
  it('returns a single page as a plain image, not a ZIP', async () => {
    const { core } = setup();
    await core.open('s', new Uint8Array(1));
    const result = await core.exportImages(1, [original(2)], png, 'doc', ignore);
    expect(result).toMatchObject({
      ok: true,
      value: { kind: 'image', name: 'doc-1.png', mime: 'image/png', fileCount: 1, pageCount: 1 },
    });
  });

  it('packs several pages, in order, with numbered names padded to the document size', async () => {
    const { core } = setup();
    await core.open('s', new Uint8Array(1));
    const pages = Array.from({ length: 12 }, (_, i) => original(i % 5));
    const progress: number[] = [];
    const result = await core.exportImages(1, pages, { ...png, format: 'jpeg' }, 'report', (done) =>
      progress.push(done),
    );
    if (!result.ok) throw new Error('exportImages failed');
    expect(result.value).toMatchObject({ kind: 'zip', name: 'report-jpeg.zip', fileCount: 12 });
    const files = unzipSync(result.value.bytes);
    expect(Object.keys(files).slice(0, 3)).toEqual([
      'report-01.jpg',
      'report-02.jpg',
      'report-03.jpg',
    ]);
    expect(Object.keys(files).at(-1)).toBe('report-12.jpg');
    expect(files['report-03.jpg']).toEqual(new Uint8Array([2, 7, 7]));
    expect(progress).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('trims the caches of pdf.js every twenty pages, so memory does not grow with the document', async () => {
    const { core, trimmed } = setup();
    await core.open('s', new Uint8Array(1));
    const pages = Array.from({ length: 45 }, (_, i) => original(i % 5));
    await core.exportImages(1, pages, png, 'doc', ignore);
    expect(trimmed.count).toBe(2);
  });

  it('hands each page its own quarter turn, and draws blank pages itself', async () => {
    const { core, calls, encodeBlank } = setup();
    await core.open('s', new Uint8Array(1));
    const result = await core.exportImages(
      1,
      [
        original(0, 90),
        { kind: 'blank', width: 595, height: 842, rotation: 180 },
        original(1, 270),
      ],
      png,
      'doc',
      ignore,
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { pageIndex: 0, rotation: 90 },
      { pageIndex: 1, rotation: 270 },
    ]);
    expect(encodeBlank).toHaveBeenCalledExactlyOnceWith(595, 842, 180, png);
  });

  it('counts the pages whose resolution had to be lowered', async () => {
    const { core } = setup({ capped: [1, 2] });
    await core.open('s', new Uint8Array(1));
    const result = await core.exportImages(
      1,
      [original(0), original(1), original(2)],
      png,
      'doc',
      ignore,
    );
    expect(result.ok && result.value.cappedPages).toBe(2);
  });

  it('fails naming the page when one cannot be drawn, without a partial result', async () => {
    const { core } = setup({ fail: 1 });
    await core.open('s', new Uint8Array(1));
    const result = await core.exportImages(
      1,
      [original(0), original(1), original(2)],
      png,
      'doc',
      ignore,
    );
    expect(result).toEqual({ ok: false, error: { kind: 'corrupt', detail: 'page 2: bad page' } });
  });

  it('fails clearly for an unknown source and for no pages at all', async () => {
    const { core } = setup();
    expect(await core.exportImages(1, [original(0, 0, 'ghost')], png, 'doc', ignore)).toMatchObject(
      {
        ok: false,
        error: { kind: 'internal' },
      },
    );
    expect(await core.exportImages(2, [], png, 'doc', ignore)).toMatchObject({
      ok: false,
      error: { kind: 'empty' },
    });
  });

  it('stops when cancelled and leaves the core ready for the next job', async () => {
    let jobId = 0;
    const { core } = setup({
      slow: () => {
        if (jobId > 0) core.cancelJob(jobId);
      },
    });
    await core.open('s', new Uint8Array(1));
    jobId = 7;
    const result = await core.exportImages(
      7,
      [original(0), original(1), original(2)],
      png,
      'doc',
      ignore,
    );
    expect(result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    jobId = 0;
    expect((await core.exportImages(8, [original(0)], png, 'doc', ignore)).ok).toBe(true);
    expect(() => {
      core.cancelJob(1234);
    }).not.toThrow();
  });
});
