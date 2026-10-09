/* eslint-disable @typescript-eslint/unbound-method -- the mocks are asserted through the objects that hold them */
import { describe, expect, it, vi } from 'vitest';
import { err, ok, pdfError } from '@vidopdf/core';
import type {
  ImageExportOptions,
  ImagePageOptions,
  PdfError,
  PdfErrorKind,
  Result,
} from '@vidopdf/core';
import type { ExportWorkerApi, PlannedOutput, ProducedFile, RenderWorkerApi } from '../workers/api';
import { createSessionStore } from './session-store';

const PDF_HEAD = '%PDF-1.7\n';
/** The file body is its own name, so the fake worker can tell which file it was handed. */
const pdf = (name: string) => new File([PDF_HEAD, name], name, { type: 'application/pdf' });
const jpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], name, { type: 'image/jpeg' });
const png = (name: string) =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])], name, {
    type: 'image/png',
  });
const webp = (name: string) =>
  new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], name, {
    type: 'image/webp',
  });

type Produced = Result<ProducedFile, PdfError>;
type Progress = (done: number, total: number) => void;

/** A promise the test settles by hand, to look at the store while a job is in flight. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const pageOptions: ImagePageOptions = { paper: 'a4', orientation: 'auto', margin: 'small' };
const imageOptions: ImageExportOptions = { format: 'png', dpi: 150, quality: 0.9 };

function produced(changes: Partial<ProducedFile> = {}): ProducedFile {
  return {
    kind: 'pdf',
    name: 'out.pdf',
    mime: 'application/pdf',
    bytes: new Uint8Array([1, 2, 3]),
    fileCount: 1,
    pageCount: 1,
    cappedPages: 0,
    ...changes,
  };
}

/** Pages per file name: "three.pdf" has 3 pages, "bad.pdf" is refused as damaged, "locked.pdf" as encrypted. */
const pageCountOf = (name: string): number | PdfErrorKind => {
  if (name.startsWith('bad')) return 'corrupt';
  if (name.startsWith('locked')) return 'encrypted';
  return name.startsWith('five') ? 5 : name.startsWith('three') ? 3 : 1;
};

function setup(
  overrides: {
    exportWorker?: Partial<ExportWorkerApi>;
    renderWorker?: Partial<RenderWorkerApi>;
  } = {},
) {
  let counter = 0;
  const exportWorker: ExportWorkerApi = {
    register: vi.fn((_id: string, bytes: Uint8Array) => {
      const result = pageCountOf(new TextDecoder().decode(bytes).slice(PDF_HEAD.length));
      return Promise.resolve(
        typeof result === 'number' ? ok({ pageCount: result }) : err(pdfError(result)),
      );
    }),
    registerImage: vi.fn(() =>
      Promise.resolve(ok({ info: { pageCount: 1 }, pdf: new Uint8Array([9]) })),
    ),
    release: vi.fn(),
    runPlan: vi.fn(() => Promise.resolve(ok(produced()))),
    splitBySize: vi.fn(() => Promise.resolve(ok([]))),
    cancelJob: vi.fn(),
    ...overrides.exportWorker,
  };
  const renderWorker: RenderWorkerApi = {
    open: vi.fn(() => Promise.resolve(ok({ pageCount: 1 }))),
    render: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(() => Promise.resolve()),
    outline: vi.fn(() => Promise.resolve(ok([]))),
    encodableFormats: vi.fn(() => Promise.resolve(['png', 'jpeg'] as const)),
    exportImages: vi.fn(() =>
      Promise.resolve(ok(produced({ kind: 'zip', name: 'x-png.zip', mime: 'application/zip' }))),
    ),
    cancelJob: vi.fn(),
    ...overrides.renderWorker,
  };
  const save = vi.fn(() => Promise.resolve());
  const store = createSessionStore({
    exportWorker: () => exportWorker,
    renderWorker: () => renderWorker,
    save,
    newId: () => `id${String(++counter)}`,
  });
  return { store, exportWorker, renderWorker, save };
}

/** Loads files one at a time, each as its own step of the history. */
async function load(ctx: ReturnType<typeof setup>, ...files: File[]) {
  for (const file of files) await ctx.store.getState().addFiles([file]);
}

const ws = (ctx: ReturnType<typeof setup>) => ctx.store.getState().session.workspace;
const ids = (ctx: ReturnType<typeof setup>) => ws(ctx).pages.map((p) => p.id);

describe('loading files', () => {
  it('registers a PDF with both workers and adds its pages, selected', async () => {
    const ctx = setup();
    await load(ctx, pdf('three.pdf'));
    expect(ws(ctx).sources.map((s) => [s.name, s.pageCount])).toEqual([['three.pdf', 3]]);
    expect(ws(ctx).pages).toHaveLength(3);
    expect(ws(ctx).selection).toHaveLength(3);
    expect(ctx.exportWorker.register).toHaveBeenCalledOnce();
    expect(ctx.renderWorker.open).toHaveBeenCalledOnce();
    expect(ctx.store.getState().loading).toBe(0);
  });

  it('gives each worker its own copy of the file, so the main thread keeps none', async () => {
    const ctx = setup();
    await load(ctx, pdf('three.pdf'));
    const forExport = vi.mocked(ctx.exportWorker.register).mock.calls[0]?.[1];
    const forRender = vi.mocked(ctx.renderWorker.open).mock.calls[0]?.[1];
    expect(forExport).toBeDefined();
    expect(forRender).toEqual(forExport);
    expect(forRender?.buffer).not.toBe(forExport?.buffer);
    expect(ws(ctx).sources[0]?.size).toBe(pdf('three.pdf').size);
  });

  it('reports files that cannot be used and keeps loading the others', async () => {
    const ctx = setup();
    await ctx.store
      .getState()
      .addFiles([
        pdf('bad.pdf'),
        pdf('locked.pdf'),
        pdf('three.pdf'),
        new File(['x'], 'notes.txt'),
      ]);
    expect(ctx.store.getState().rejections.map((r) => [r.name, r.kind])).toEqual([
      ['bad.pdf', 'corrupt'],
      ['locked.pdf', 'encrypted'],
      ['notes.txt', 'notPdf'],
    ]);
    expect(ws(ctx).pages).toHaveLength(3);
    expect(ctx.exportWorker.release).not.toHaveBeenCalled();
  });

  it('releases a file the render worker cannot open', async () => {
    const ctx = setup({
      renderWorker: { open: vi.fn(() => Promise.resolve(err(pdfError('corrupt')))) },
    });
    await ctx.store.getState().addFiles([pdf('three.pdf')]);
    expect(ctx.store.getState().rejections[0]?.kind).toBe('corrupt');
    expect(ctx.exportWorker.release).toHaveBeenCalledOnce();
    expect(ws(ctx).pages).toHaveLength(0);
  });

  it('clears the previous errors when new files arrive', async () => {
    const ctx = setup();
    await ctx.store.getState().addFiles([pdf('bad.pdf')]);
    expect(ctx.store.getState().rejections).toHaveLength(1);
    await ctx.store.getState().addFiles([pdf('three.pdf')]);
    expect(ctx.store.getState().rejections).toHaveLength(0);
  });

  it('holds JPEG and PNG back until the user chooses layout options, and turns WebP and GIF down', async () => {
    const ctx = setup();
    await ctx.store.getState().addFiles([jpeg('a.jpg'), png('b.png'), webp('c.webp')]);
    expect(ctx.store.getState().pendingImages.map((p) => p.file.name)).toEqual(['a.jpg', 'b.png']);
    expect(ctx.store.getState().rejections.map((r) => [r.name, r.kind])).toEqual([
      ['c.webp', 'unsupportedImage'],
    ]);
    expect(ws(ctx).pages).toHaveLength(0);
    expect(ctx.exportWorker.registerImage).not.toHaveBeenCalled();
  });

  it('turns the waiting pictures into one-page sources, in order, with the chosen options', async () => {
    const ctx = setup();
    await ctx.store.getState().addFiles([jpeg('a.jpg'), png('b.png')]);
    await ctx.store.getState().addImages(pageOptions);
    expect(ctx.store.getState().pendingImages).toHaveLength(0);
    expect(ws(ctx).sources.map((s) => s.name)).toEqual(['a.jpg', 'b.png']);
    expect(ws(ctx).pages).toHaveLength(2);
    const calls = vi.mocked(ctx.exportWorker.registerImage).mock.calls;
    expect(calls.map((call) => call[2])).toEqual([pageOptions, pageOptions]);
    expect(ctx.renderWorker.open).toHaveBeenCalledTimes(2);
    expect(ctx.store.getState().loading).toBe(0);
  });

  it('reports a picture that cannot be converted and can drop the waiting ones', async () => {
    const ctx = setup({
      exportWorker: { registerImage: vi.fn(() => Promise.resolve(err(pdfError('corrupt')))) },
    });
    await ctx.store.getState().addFiles([jpeg('broken.jpg')]);
    await ctx.store.getState().addImages(pageOptions);
    expect(ctx.store.getState().rejections.map((r) => [r.name, r.kind])).toEqual([
      ['broken.jpg', 'corrupt'],
    ]);
    await ctx.store.getState().addFiles([png('b.png')]);
    ctx.store.getState().discardImages();
    expect(ctx.store.getState().pendingImages).toHaveLength(0);
  });
});

describe('editing', () => {
  it('rotates, duplicates, deletes, inserts a blank page and undoes it all', async () => {
    const ctx = setup();
    await load(ctx, pdf('three.pdf'));
    const s = ctx.store.getState();
    s.clearSelected();
    s.select(ids(ctx)[1] ?? '', 'only');
    s.rotateSelected(90);
    expect(ws(ctx).pages[1]?.rotation).toBe(90);
    s.duplicateSelected();
    expect(ws(ctx).pages).toHaveLength(4);
    s.insertBlankAfterSelection();
    expect(ws(ctx).pages.filter((p) => p.kind === 'blank')).toHaveLength(1);
    s.deleteSelected();
    expect(ws(ctx).pages).toHaveLength(4);
    for (let step = 0; step < 4; step++) s.undo();
    expect(ws(ctx).pages.map((p) => p.rotation)).toEqual([0, 0, 0]);
    s.redo();
    s.redo();
    expect(ws(ctx).pages).toHaveLength(4);
  });

  it('moves the selection into a gap and extends it with range and toggle', async () => {
    const ctx = setup();
    await load(ctx, pdf('five.pdf'));
    const s = ctx.store.getState();
    const first = ids(ctx);
    s.select(first[0] ?? '', 'only');
    s.select(first[2] ?? '', 'range');
    expect(ws(ctx).selection).toEqual(first.slice(0, 3));
    s.select(first[4] ?? '', 'toggle');
    s.selectIds([first[3] ?? ''], false);
    expect(ws(ctx).selection).toEqual([first[3]]);
    s.moveSelectedToGap(0);
    expect(ids(ctx)[0]).toBe(first[3]);
    s.selectEverything();
    expect(ws(ctx).selection).toHaveLength(5);
  });

  it('ignores edits with nothing selected', async () => {
    const ctx = setup();
    await load(ctx, pdf('three.pdf'));
    const s = ctx.store.getState();
    s.clearSelected();
    s.rotateSelected(90);
    s.deleteSelected();
    s.duplicateSelected();
    s.moveSelectedToGap(0);
    expect(ws(ctx).pages.map((p) => p.rotation)).toEqual([0, 0, 0]);
  });
});

describe('exporting one PDF', () => {
  it('sends the pages in order, shows progress, and offers the result for saving', async () => {
    let report: Progress = () => undefined;
    const result = deferred<Produced>();
    const ctx = setup({
      exportWorker: {
        runPlan: vi.fn(
          (
            _id: number,
            _outputs: readonly PlannedOutput[],
            _archive: string,
            onProgress: Progress,
          ) => {
            report = onProgress;
            return result.promise;
          },
        ),
      },
    });
    await load(ctx, pdf('three.pdf'));
    const done = ctx.store.getState().startExport();
    expect(ctx.store.getState().job).toEqual({ phase: 'running', job: 'pdf', done: 0, total: 3 });
    report(2, 3);
    expect(ctx.store.getState().job).toMatchObject({ phase: 'running', done: 2 });
    result.resolve(ok(produced({ pageCount: 3 })));
    await done;
    const [, outputs, archive] = vi.mocked(ctx.exportWorker.runPlan).mock.calls[0] ?? [];
    expect(outputs?.map((o) => [o.name, o.pages.length])).toEqual([['three.pdf', 3]]);
    expect(archive).toBe('three.zip');
    expect(ctx.store.getState().job).toMatchObject({ phase: 'ready', job: 'pdf' });

    await ctx.store.getState().saveResult();
    expect(ctx.save).toHaveBeenCalledExactlyOnceWith(
      new Uint8Array([1, 2, 3]),
      'out.pdf',
      'application/pdf',
    );
    expect(ctx.store.getState().job.phase).toBe('idle');
  });

  it('ignores progress that arrives after the result', async () => {
    let report: Progress = () => undefined;
    const ctx = setup({
      exportWorker: {
        runPlan: vi.fn(
          (
            _id: number,
            _outputs: readonly PlannedOutput[],
            _archive: string,
            onProgress: Progress,
          ) => {
            report = onProgress;
            return Promise.resolve(ok(produced()));
          },
        ),
      },
    });
    await load(ctx, pdf('three.pdf'));
    await ctx.store.getState().startExport();
    report(3, 3);
    expect(ctx.store.getState().job.phase).toBe('ready');
  });

  it('does nothing without pages, and does not start a second job while one runs', async () => {
    const ctx = setup({ exportWorker: { runPlan: vi.fn(() => deferred<Produced>().promise) } });
    await ctx.store.getState().startExport();
    expect(ctx.exportWorker.runPlan).not.toHaveBeenCalled();
    await load(ctx, pdf('three.pdf'));
    void ctx.store.getState().startExport();
    await ctx.store.getState().startExport();
    expect(ctx.exportWorker.runPlan).toHaveBeenCalledOnce();
  });

  it('cancels through the worker and goes back to idle when the worker confirms', async () => {
    const result = deferred<Produced>();
    const ctx = setup({ exportWorker: { runPlan: vi.fn(() => result.promise) } });
    await load(ctx, pdf('three.pdf'));
    const done = ctx.store.getState().startExport();
    ctx.store.getState().cancelJob();
    expect(ctx.exportWorker.cancelJob).toHaveBeenCalledOnce();
    result.resolve(err(pdfError('cancelled')));
    await done;
    expect(ctx.store.getState().job.phase).toBe('idle');
  });

  it('reports a failure, and dismissing returns to idle', async () => {
    const ctx = setup({
      exportWorker: { runPlan: vi.fn(() => Promise.resolve(err(pdfError('corrupt', 'bad xref')))) },
    });
    await load(ctx, pdf('three.pdf'));
    await ctx.store.getState().startExport();
    expect(ctx.store.getState().job).toEqual({
      phase: 'failed',
      job: 'pdf',
      failure: { kind: 'corrupt', detail: 'bad xref' },
    });
    ctx.store.getState().dismissJob();
    expect(ctx.store.getState().job.phase).toBe('idle');
  });

  it('cancelling or saving with nothing to do is harmless', async () => {
    const ctx = setup();
    ctx.store.getState().cancelJob();
    await ctx.store.getState().saveResult();
    expect(ctx.save).not.toHaveBeenCalled();
  });
});

describe('extracting', () => {
  it('exports only the selected pages, in document order, under an extract name', async () => {
    const ctx = setup();
    await load(ctx, pdf('five.pdf'));
    const all = ids(ctx);
    ctx.store.getState().select(all[3] ?? '', 'only');
    ctx.store.getState().select(all[1] ?? '', 'toggle');
    await ctx.store.getState().extractSelection();
    const [, outputs] = vi.mocked(ctx.exportWorker.runPlan).mock.calls[0] ?? [];
    expect(
      outputs?.map((o) => [o.name, o.pages.map((p) => (p.kind === 'original' ? p.pageIndex : -1))]),
    ).toEqual([['five_extract.pdf', [1, 3]]]);
    expect(ctx.store.getState().job).toMatchObject({ phase: 'ready', job: 'extract' });
  });

  it('does nothing with no selection', async () => {
    const ctx = setup();
    await load(ctx, pdf('five.pdf'));
    ctx.store.getState().clearSelected();
    await ctx.store.getState().extractSelection();
    expect(ctx.exportWorker.runPlan).not.toHaveBeenCalled();
  });
});

describe('splitting', () => {
  it('previews an every-N split without touching the workers', async () => {
    const ctx = setup();
    await load(ctx, pdf('five.pdf'));
    await ctx.store.getState().previewSplit({ mode: 'every', count: 2 });
    const split = ctx.store.getState().split;
    expect(split.phase === 'ready' && split.groups.map((g) => g.pages.length)).toEqual([2, 2, 1]);
    expect(ctx.exportWorker.splitBySize).not.toHaveBeenCalled();
  });

  it('turns a typing mistake into a failed preview that says what is wrong', async () => {
    const ctx = setup();
    await load(ctx, pdf('five.pdf'));
    await ctx.store.getState().previewSplit({ mode: 'ranges', text: '1-9', keepRest: false });
    expect(ctx.store.getState().split).toEqual({
      phase: 'failed',
      error: { kind: 'ranges', problem: { kind: 'outOfRange', token: '1-9', pageCount: 5 } },
    });
    ctx.store.getState().clearSplit();
    expect(ctx.store.getState().split.phase).toBe('idle');
  });

  it('reads each file outline once and cuts at its bookmarks', async () => {
    const outline = vi.fn(() => Promise.resolve(ok([{ title: 'Part 2', pageIndex: 2, level: 1 }])));
    const ctx = setup({ renderWorker: { outline } });
    await load(ctx, pdf('five.pdf'));
    await ctx.store.getState().previewSplit({ mode: 'bookmarks', level: 1 });
    await ctx.store.getState().previewSplit({ mode: 'bookmarks', level: 1 });
    expect(outline).toHaveBeenCalledOnce();
    const split = ctx.store.getState().split;
    expect(split.phase === 'ready' && split.groups.map((g) => [g.title, g.pages.length])).toEqual([
      [undefined, 2],
      ['Part 2', 3],
    ]);
  });

  it('treats a file whose outline cannot be read as having no bookmarks', async () => {
    const ctx = setup({
      renderWorker: { outline: vi.fn(() => Promise.resolve(err(pdfError('corrupt')))) },
    });
    await load(ctx, pdf('five.pdf'));
    await ctx.store.getState().previewSplit({ mode: 'bookmarks', level: 1 });
    const split = ctx.store.getState().split;
    expect(split.phase === 'ready' && split.groups).toHaveLength(1);
  });

  it('measures a size split in the worker and keeps the measured sizes', async () => {
    const splitBySize = vi.fn(
      (
        _id: number,
        _pages: unknown,
        _limit: number,
        onProgress: (d: number, t: number) => void,
      ) => {
        onProgress(3, 5);
        return Promise.resolve(
          ok([
            { from: 0, to: 2, size: 900 },
            { from: 3, to: 4, size: 700 },
          ]),
        );
      },
    );
    const ctx = setup({ exportWorker: { splitBySize } });
    await load(ctx, pdf('five.pdf'));
    await ctx.store.getState().previewSplit({ mode: 'size', limitBytes: 1000 });
    expect(splitBySize.mock.calls[0]?.[2]).toBe(1000);
    const split = ctx.store.getState().split;
    expect(
      split.phase === 'ready' && [split.groups.map((g) => g.pages.length), split.sizes],
    ).toEqual([
      [3, 2],
      [900, 700],
    ]);
    expect(split.phase === 'ready' && split.groups[1]?.span).toEqual({ from: 4, to: 5 });
  });

  it('shows the progress of measuring, and a page that cannot fit as a failed preview', async () => {
    const measured = deferred<Awaited<ReturnType<ExportWorkerApi['splitBySize']>>>();
    const ctx = setup({ exportWorker: { splitBySize: vi.fn(() => measured.promise) } });
    await load(ctx, pdf('five.pdf'));
    const pending = ctx.store.getState().previewSplit({ mode: 'size', limitBytes: 10 });
    expect(ctx.store.getState().split).toEqual({ phase: 'measuring', done: 0, total: 5 });
    measured.resolve(err({ kind: 'pageTooLarge', pageNumber: 2, size: 50, limit: 10 }));
    await pending;
    expect(ctx.store.getState().split).toEqual({
      phase: 'failed',
      error: { kind: 'pageTooLarge', pageNumber: 2, size: 50, limit: 10 },
    });
  });

  it('can cancel measuring, and measuring blocks other jobs', async () => {
    const measured = deferred<Awaited<ReturnType<ExportWorkerApi['splitBySize']>>>();
    const ctx = setup({ exportWorker: { splitBySize: vi.fn(() => measured.promise) } });
    await load(ctx, pdf('five.pdf'));
    const pending = ctx.store.getState().previewSplit({ mode: 'size', limitBytes: 10 });
    await ctx.store.getState().startExport();
    expect(ctx.exportWorker.runPlan).not.toHaveBeenCalled();
    ctx.store.getState().cancelJob();
    expect(ctx.exportWorker.cancelJob).toHaveBeenCalledOnce();
    measured.resolve(err({ kind: 'cancelled' }));
    await pending;
    expect(ctx.store.getState().split.phase).toBe('idle');
  });

  it('builds one named PDF per group when the split is run, packed under a split archive name', async () => {
    const ctx = setup();
    await load(ctx, pdf('five.pdf'));
    await ctx.store.getState().runSplit(); // nothing previewed yet: nothing happens
    expect(ctx.exportWorker.runPlan).not.toHaveBeenCalled();
    await ctx.store.getState().previewSplit({ mode: 'every', count: 2 });
    await ctx.store.getState().runSplit();
    const [, outputs, archive] = vi.mocked(ctx.exportWorker.runPlan).mock.calls[0] ?? [];
    expect(outputs?.map((o) => o.name)).toEqual(['five_1.pdf', 'five_2.pdf', 'five_3.pdf']);
    expect(archive).toBe('five_split.zip');
    expect(ctx.store.getState().job).toMatchObject({ phase: 'ready', job: 'split' });
  });
});

describe('exporting images', () => {
  it('sends every page with its rotation, blank pages included, and the base name', async () => {
    const ctx = setup();
    await load(ctx, pdf('three.pdf'));
    const s = ctx.store.getState();
    s.clearSelected();
    s.select(ids(ctx)[0] ?? '', 'only');
    s.rotateSelected(270);
    s.insertBlankAfterSelection();
    await s.exportImages(imageOptions, 'all');
    const [, pages, options, base] = vi.mocked(ctx.renderWorker.exportImages).mock.calls[0] ?? [];
    expect(pages).toEqual([
      { kind: 'original', sourceId: 'id1', pageIndex: 0, rotation: 270 },
      { kind: 'blank', width: 595, height: 842, rotation: 0 },
      { kind: 'original', sourceId: 'id1', pageIndex: 1, rotation: 0 },
      { kind: 'original', sourceId: 'id1', pageIndex: 2, rotation: 0 },
    ]);
    expect(options).toEqual(imageOptions);
    expect(base).toBe('three');
    expect(ctx.store.getState().job).toMatchObject({ phase: 'ready', job: 'images' });
  });

  it('can export only the selection', async () => {
    const ctx = setup();
    await load(ctx, pdf('five.pdf'));
    ctx.store.getState().select(ids(ctx)[2] ?? '', 'only');
    await ctx.store.getState().exportImages(imageOptions, 'selection');
    const [, pages] = vi.mocked(ctx.renderWorker.exportImages).mock.calls[0] ?? [];
    expect(pages).toEqual([{ kind: 'original', sourceId: 'id1', pageIndex: 2, rotation: 0 }]);
  });

  it('does nothing when there are no pages to turn into pictures', async () => {
    const ctx = setup();
    await ctx.store.getState().exportImages(imageOptions, 'all');
    expect(ctx.renderWorker.exportImages).not.toHaveBeenCalled();
  });

  it('cancels through the render worker, and reports a failed page', async () => {
    const result = deferred<Produced>();
    const ctx = setup({ renderWorker: { exportImages: vi.fn(() => result.promise) } });
    await load(ctx, pdf('five.pdf'));
    const pending = ctx.store.getState().exportImages(imageOptions, 'all');
    ctx.store.getState().cancelJob();
    expect(ctx.renderWorker.cancelJob).toHaveBeenCalledOnce();
    result.resolve(err(pdfError('unsupported', 'this browser cannot encode webp')));
    await pending;
    expect(ctx.store.getState().job).toMatchObject({
      phase: 'failed',
      job: 'images',
      failure: { kind: 'unsupported' },
    });
  });
});

describe('browser capabilities', () => {
  it('asks once which picture formats can be written', async () => {
    const ctx = setup();
    await ctx.store.getState().loadEncodableFormats();
    await ctx.store.getState().loadEncodableFormats();
    expect(ctx.store.getState().encodable).toEqual(['png', 'jpeg']);
    expect(ctx.renderWorker.encodableFormats).toHaveBeenCalledOnce();
  });
});

describe('compression', () => {
  const planned = (ctx: ReturnType<typeof setup>) =>
    vi.mocked(ctx.exportWorker.runPlan).mock.calls.at(-1)?.[1] ?? [];

  it('is off until the user chooses it, and then reaches the worker with every kind of job', async () => {
    const ctx = setup();
    await load(ctx, pdf('three.pdf'));
    expect(ctx.store.getState().compression).toBe('off');
    await ctx.store.getState().startExport();
    expect(planned(ctx)[0]?.compression).toBeUndefined();

    ctx.store.getState().setCompression('balanced');
    ctx.store.getState().dismissJob();
    await ctx.store.getState().startExport();
    expect(planned(ctx)[0]?.compression).toBe('balanced');

    ctx.store.getState().setCompression('screen');
    ctx.store.getState().dismissJob();
    await ctx.store.getState().extractSelection();
    expect(planned(ctx)[0]?.compression).toBe('screen');

    ctx.store.getState().setCompression('print');
    ctx.store.getState().dismissJob();
    await ctx.store.getState().previewSplit({ mode: 'every', count: 1 });
    await ctx.store.getState().runSplit();
    expect(planned(ctx).map((output) => output.compression)).toEqual(['print', 'print', 'print']);
  });

  it('marks a running job as compressing so the dialog does not talk about pages', async () => {
    const result = deferred<Produced>();
    const ctx = setup({ exportWorker: { runPlan: vi.fn(() => result.promise) } });
    await load(ctx, pdf('three.pdf'));
    ctx.store.getState().setCompression('balanced');
    const done = ctx.store.getState().startExport();
    expect(ctx.store.getState().job).toMatchObject({ phase: 'running', compressing: true });
    result.resolve(ok(produced()));
    await done;
  });
});
