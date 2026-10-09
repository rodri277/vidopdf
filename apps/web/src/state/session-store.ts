import { create } from 'zustand';
import { proxy, transfer } from 'comlink';
import {
  addSource,
  err,
  buildExportPlan,
  buildExtractPlan,
  buildSplitPlan,
  decorationsForMeasuring,
  outputCompression,
  clearSelection,
  createSession,
  deletePages,
  duplicatePages,
  emptyWorkspace,
  execute,
  insertBlankPage,
  movePagesToGap,
  pdfError,
  redo,
  rotatePages,
  selectAll,
  selectMany,
  selectOnly,
  selectRange,
  stripExtension,
  suggestedBaseName,
  toggleSelection,
  undo,
  withWorkspace,
} from '@vidopdf/core';
import type {
  Command,
  CompressionPreset,
  ExportPlan,
  ImageExportOptions,
  ImageFormat,
  ImagePageOptions,
  OutlineEntry,
  PageGroup,
  PageRef,
  PdfErrorKind,
  Session,
  SourceFile,
  SplitError,
  Workspace,
} from '@vidopdf/core';
import type {
  ExportWorkerApi,
  ImageJobPage,
  PlannedOutput,
  ProducedFile,
  RenderWorkerApi,
} from '../workers/api';
import { SNIFF_BYTES, classifyFile } from './classify';
import { groupsFor } from './split';
import type { SplitSpec } from './split';

export type RejectionKind = PdfErrorKind | 'notPdf' | 'unsupportedImage';

export interface Rejection {
  readonly id: string;
  readonly name: string;
  readonly kind: RejectionKind;
}

/** Why a job did not produce a file. A split has its own reasons (a page that cannot fit...). */
export type JobFailure =
  | { readonly kind: PdfErrorKind; readonly detail?: string }
  | { readonly kind: 'split'; readonly error: SplitError };

export type JobKind = 'pdf' | 'extract' | 'split' | 'images';

export type JobState =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'running';
      readonly job: JobKind;
      readonly done: number;
      readonly total: number;
      /** The bar covers building and then compressing, so "pages" would be the wrong word. */
      readonly compressing?: boolean;
    }
  | { readonly phase: 'ready'; readonly job: JobKind; readonly result: ProducedFile }
  | { readonly phase: 'failed'; readonly job: JobKind; readonly failure: JobFailure };

/** The groups a split would make, shown before anything is built. */
export type SplitPreview =
  | { readonly phase: 'idle' }
  | { readonly phase: 'measuring'; readonly done: number; readonly total: number }
  | {
      readonly phase: 'ready';
      readonly spec: SplitSpec;
      readonly groups: readonly PageGroup[];
      /** Measured size of each group; only the "size" mode knows it before building. */
      readonly sizes: readonly number[] | undefined;
    }
  | { readonly phase: 'failed'; readonly error: SplitError };

export interface PendingImage {
  readonly id: string;
  readonly file: File;
}

export type ImageScope = 'all' | 'selection';

/** What the user chose for the pictures inside the PDFs they export. */
export type CompressionChoice = CompressionPreset | 'off';

/** What the store needs from the outside world; tests supply fakes. */
export interface SessionDeps {
  readonly exportWorker: () => ExportWorkerApi;
  readonly renderWorker: () => RenderWorkerApi;
  readonly save: (bytes: Uint8Array, name: string, mimeType: string) => Promise<void>;
  readonly newId: () => string;
}

/** A4 in PDF points: the size of a page inserted without a reference. */
const BLANK_SIZE = { width: 595, height: 842 } as const;

export interface SessionState {
  session: Session;
  rejections: readonly Rejection[];
  /** Files being read right now (shown as progress). */
  loading: number;
  /** Pictures waiting for the user to choose how they become pages. */
  pendingImages: readonly PendingImage[];
  /** Bookmarks of each source, loaded on demand. */
  outlines: Readonly<Record<string, readonly OutlineEntry[]>>;
  /** Picture formats this browser can write; undefined until asked. */
  encodable: readonly ImageFormat[] | undefined;
  job: JobState;
  split: SplitPreview;
  /** Applies to every PDF the app builds: the whole file, an extract and the parts of a split. */
  compression: CompressionChoice;
  setCompression: (choice: CompressionChoice) => void;
  addFiles: (files: readonly File[]) => Promise<void>;
  addImages: (options: ImagePageOptions) => Promise<void>;
  discardImages: () => void;
  select: (id: string, mode: 'only' | 'toggle' | 'range') => void;
  selectIds: (ids: readonly string[], additive: boolean) => void;
  selectEverything: () => void;
  clearSelected: () => void;
  rotateSelected: (degrees: number) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  insertBlankAfterSelection: () => void;
  moveSelectedToGap: (gap: number) => void;
  undo: () => void;
  redo: () => void;
  loadOutlines: () => Promise<void>;
  loadEncodableFormats: () => Promise<void>;
  previewSplit: (spec: SplitSpec) => Promise<void>;
  clearSplit: () => void;
  startExport: () => Promise<void>;
  extractSelection: () => Promise<void>;
  runSplit: () => Promise<void>;
  exportImages: (options: ImageExportOptions, scope: ImageScope) => Promise<void>;
  cancelJob: () => void;
  saveResult: () => Promise<void>;
  dismissJob: () => void;
}

async function fingerprintOf(bytes: Uint8Array<ArrayBuffer>, file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // crypto.subtle only exists in secure contexts; the fingerprint is a convenience, not security.
    return `${String(file.size)}-${String(file.lastModified)}`;
  }
}

function toImageJobPage(page: PageRef): ImageJobPage {
  return page.kind === 'original'
    ? {
        kind: 'original',
        sourceId: page.sourceId,
        pageIndex: page.sourceIndex,
        rotation: page.rotation,
      }
    : { kind: 'blank', width: page.width, height: page.height, rotation: page.rotation };
}

function toPlanned(plan: ExportPlan): PlannedOutput[] {
  return plan.outputs.map((output) => {
    const compression = outputCompression(output);
    const assemble = output.steps.find((step) => step.kind === 'assemble');
    return {
      name: output.name,
      pages: assemble?.kind === 'assemble' ? assemble.pages : [],
      ...(assemble?.kind === 'assemble' ? { decorations: assemble.decorations } : {}),
      ...(compression === undefined ? {} : { compression }),
    };
  });
}

const presetOf = (choice: CompressionChoice): CompressionPreset | undefined =>
  choice === 'off' ? undefined : choice;

function pagesFor(workspace: Workspace, scope: ImageScope): readonly PageRef[] {
  if (scope === 'all') return workspace.pages;
  const chosen = new Set(workspace.selection);
  return workspace.pages.filter((page) => chosen.has(page.id));
}

function pagesOf(source: SourceFile, newId: () => string): PageRef[] {
  return Array.from({ length: source.pageCount }, (_, sourceIndex) => ({
    kind: 'original' as const,
    id: newId(),
    sourceId: source.id,
    sourceIndex,
    rotation: 0 as const,
  }));
}

interface Loaded {
  readonly source: SourceFile;
}

/** A rejected promise (a worker that failed outright, a file the browser cannot read) as text. */
function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLoaded(entry: Loaded | Rejection): entry is Loaded {
  return 'source' in entry;
}

export function createSessionStore(deps: SessionDeps) {
  let jobCounter = 0;
  /** Stops whatever is running; set while a job is in flight. */
  let cancelActive: (() => void) | undefined;

  return create<SessionState>((set, get) => {
    const run = (command: Command) => {
      set((state) => ({ session: execute(state.session, command) }));
    };
    const editWorkspace = (change: (workspace: Workspace) => Workspace) => {
      set((state) => ({ session: withWorkspace(state.session, change(state.session.workspace)) }));
    };
    const workspace = () => get().session.workspace;
    const busy = () => get().job.phase === 'running' || get().split.phase === 'measuring';

    /** A fresh copy of the file's bytes. Reading again is cheaper than holding a copy in the main thread for the whole load. */
    const readFresh = async (file: File) => new Uint8Array(await file.arrayBuffer());

    /**
     * Hands a file to both workers and builds its SourceFile, or says why not. Each worker gets
     * its own freshly read copy, moved to it rather than copied, so the main thread never holds
     * the file and only the two workers do.
     */
    async function register(
      file: File,
      send: (
        id: string,
        bytes: Uint8Array<ArrayBuffer>,
      ) => Promise<{ pageCount: number; forRender?: Uint8Array } | PdfErrorKind>,
    ): Promise<Loaded | Rejection> {
      const id = deps.newId();
      try {
        return await registerAs(id, file, send);
      } catch {
        // Whatever half-finished state a worker kept for this file is no use to anyone now.
        deps.exportWorker().release(id);
        void deps
          .renderWorker()
          .release(id)
          .catch(() => undefined);
        return { id, name: file.name, kind: 'internal' };
      }
    }

    async function registerAs(
      id: string,
      file: File,
      send: (
        id: string,
        bytes: Uint8Array<ArrayBuffer>,
      ) => Promise<{ pageCount: number; forRender?: Uint8Array } | PdfErrorKind>,
    ): Promise<Loaded | Rejection> {
      const bytes = await readFresh(file);
      const fingerprint = await fingerprintOf(bytes, file);
      const sent = await send(id, bytes);
      if (typeof sent === 'string') return { id, name: file.name, kind: sent };
      const forRender = sent.forRender ?? (await readFresh(file));
      const opened = await deps.renderWorker().open(id, transfer(forRender, [forRender.buffer]));
      if (!opened.ok) {
        deps.exportWorker().release(id);
        return { id, name: file.name, kind: opened.error.kind };
      }
      const source: SourceFile = {
        id,
        name: file.name,
        pageCount: sent.pageCount,
        size: file.size,
        fingerprint,
        encrypted: false,
      };
      return { source };
    }

    function loadPdf(file: File): Promise<Loaded | Rejection> {
      return register(file, async (id, bytes) => {
        const info = await deps.exportWorker().register(id, transfer(bytes, [bytes.buffer]));
        return info.ok ? { pageCount: info.value.pageCount } : info.error.kind;
      });
    }

    function loadImage(file: File, options: ImagePageOptions): Promise<Loaded | Rejection> {
      return register(file, async (id, bytes) => {
        const made = await deps
          .exportWorker()
          .registerImage(id, transfer(bytes, [bytes.buffer]), options);
        return made.ok
          ? { pageCount: made.value.info.pageCount, forRender: made.value.pdf }
          : made.error.kind;
      });
    }

    async function addOne(file: File): Promise<void> {
      const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
      const kind = classifyFile(head, file.name, file.type);
      if (kind.kind === 'pdf') adopt(await loadPdf(file));
      else if (kind.kind === 'image') {
        set((state) => ({
          pendingImages: [...state.pendingImages, { id: deps.newId(), file }],
        }));
      } else adopt({ id: deps.newId(), name: file.name, kind: kind.reason });
    }

    function adopt(entry: Loaded | Rejection): void {
      if (isLoaded(entry))
        run(addSource(entry.source, pagesOf(entry.source, deps.newId))(workspace()));
      else set((state) => ({ rejections: [...state.rejections, entry] }));
    }

    /** Progress travels on its own message channel and can arrive after the result, so it may only update a job still running. */
    function progressTo(jobId: number) {
      return proxy((done: number, total: number) => {
        const current = get().job;
        if (jobCounter === jobId && current.phase === 'running' && done > current.done) {
          set({ job: { ...current, done, total } });
        }
      });
    }

    function finish(
      job: JobKind,
      outcome:
        | { ok: true; value: ProducedFile }
        | { ok: false; error: { kind: PdfErrorKind; detail?: string } },
    ) {
      cancelActive = undefined;
      if (outcome.ok) set({ job: { phase: 'ready', job, result: outcome.value } });
      else if (outcome.error.kind === 'cancelled') set({ job: { phase: 'idle' } });
      else set({ job: { phase: 'failed', job, failure: outcome.error } });
    }

    async function runPlan(job: JobKind, plan: ExportPlan, archiveName: string): Promise<void> {
      const outputs = toPlanned(plan);
      const total = outputs.reduce((sum, output) => sum + output.pages.length, 0);
      if (outputs.length === 0 || busy()) return;
      const jobId = ++jobCounter;
      cancelActive = () => {
        deps.exportWorker().cancelJob(jobId);
      };
      const compressing = outputs.some((output) => output.compression !== undefined);
      set({
        job: { phase: 'running', job, done: 0, total, ...(compressing ? { compressing } : {}) },
      });
      finish(
        job,
        await deps
          .exportWorker()
          .runPlan(jobId, outputs, archiveName, progressTo(jobId))
          .catch(failedOutright),
      );
    }

    /** A worker call that threw instead of answering with a result. */
    function failedOutright(error: unknown) {
      return err(pdfError('internal', describeFailure(error)));
    }

    const baseName = () => suggestedBaseName(workspace());
    const compressionOption = () => {
      const preset = presetOf(get().compression);
      return preset === undefined ? {} : { compression: preset };
    };

    return {
      session: createSession(emptyWorkspace),
      rejections: [],
      loading: 0,
      pendingImages: [],
      outlines: {},
      encodable: undefined,
      job: { phase: 'idle' },
      split: { phase: 'idle' },
      compression: 'off',

      setCompression(compression) {
        set({ compression });
      },

      async addFiles(files) {
        set({ rejections: [] });
        set((state) => ({ loading: state.loading + files.length }));
        for (const file of files) {
          // One at a time: a damaged file reports its own error and never stops the others.
          try {
            await addOne(file);
          } catch {
            // The browser could not even read it (moved, deleted, no permission).
            adopt({ id: deps.newId(), name: file.name, kind: 'internal' });
          } finally {
            set((state) => ({ loading: state.loading - 1 }));
          }
        }
      },

      async addImages(options) {
        const pending = get().pendingImages;
        set({ pendingImages: [], rejections: [] });
        set((state) => ({ loading: state.loading + pending.length }));
        for (const { file } of pending) {
          adopt(await loadImage(file, options));
          set((state) => ({ loading: state.loading - 1 }));
        }
      },

      discardImages() {
        set({ pendingImages: [] });
      },

      select(id, mode) {
        editWorkspace((ws) =>
          mode === 'only'
            ? selectOnly(ws, id)
            : mode === 'toggle'
              ? toggleSelection(ws, id)
              : selectRange(ws, id),
        );
      },
      selectIds: (ids, additive) => {
        editWorkspace((ws) => selectMany(ws, ids, additive));
      },
      selectEverything: () => {
        editWorkspace(selectAll);
      },
      clearSelected: () => {
        editWorkspace(clearSelection);
      },

      rotateSelected(degrees) {
        const ids = workspace().selection;
        if (ids.length > 0) run(rotatePages(ids, degrees));
      },
      deleteSelected() {
        const ids = workspace().selection;
        if (ids.length > 0) run(deletePages(ids));
      },
      duplicateSelected() {
        const ids = workspace().selection;
        if (ids.length > 0)
          run(
            duplicatePages(
              workspace(),
              ids,
              ids.map(() => deps.newId()),
            ),
          );
      },
      insertBlankAfterSelection() {
        const ws = workspace();
        const last = ws.selection.at(-1);
        const after =
          last === undefined ? ws.pages.length : ws.pages.findIndex((p) => p.id === last) + 1;
        run(
          insertBlankPage(
            ws,
            { kind: 'blank', id: deps.newId(), ...BLANK_SIZE, rotation: 0 },
            after,
          ),
        );
      },
      moveSelectedToGap(gap) {
        const ws = workspace();
        if (ws.selection.length > 0) run(movePagesToGap(ws, ws.selection, gap));
      },

      undo: () => {
        set((state) => ({ session: undo(state.session) }));
      },
      redo: () => {
        set((state) => ({ session: redo(state.session) }));
      },

      async loadOutlines() {
        const missing = workspace().sources.filter(
          (source) => get().outlines[source.id] === undefined,
        );
        const read = await Promise.all(
          missing.map(async (source) => {
            const result = await deps.renderWorker().outline(source.id).catch(failedOutright);
            // A file whose outline cannot be read simply has no bookmarks to cut at.
            return [source.id, result.ok ? result.value : []] as const;
          }),
        );
        set((state) => ({ outlines: { ...state.outlines, ...Object.fromEntries(read) } }));
      },

      async loadEncodableFormats() {
        if (get().encodable !== undefined) return;
        // PNG is written by every browser; it is the safe answer if the question itself fails.
        const formats = await deps
          .renderWorker()
          .encodableFormats()
          .catch((): readonly ImageFormat[] => ['png']);
        set({ encodable: formats });
      },

      async previewSplit(spec) {
        if (busy()) return;
        const pages = workspace().pages;
        if (spec.mode !== 'size') {
          if (spec.mode === 'bookmarks') await get().loadOutlines();
          const groups = groupsFor(spec, pages, get().outlines);
          set({
            split: groups.ok
              ? { phase: 'ready', spec, groups: groups.value, sizes: undefined }
              : { phase: 'failed', error: groups.error },
          });
          return;
        }
        const jobId = ++jobCounter;
        cancelActive = () => {
          deps.exportWorker().cancelJob(jobId);
        };
        set({ split: { phase: 'measuring', done: 0, total: pages.length } });
        const spans = await deps
          .exportWorker()
          .splitBySize(
            jobId,
            pages,
            spec.limitBytes,
            proxy((done: number, total: number) => {
              const current = get().split;
              if (jobCounter === jobId && current.phase === 'measuring' && done > current.done) {
                set({ split: { phase: 'measuring', done, total } });
              }
            }),
            { decorations: decorationsForMeasuring(workspace()), edits: workspace().edits },
          )
          .catch((error: unknown) =>
            err({ kind: 'measureFailed' as const, detail: describeFailure(error) }),
          );
        cancelActive = undefined;
        if (!spans.ok) {
          set({
            split:
              spans.error.kind === 'cancelled'
                ? { phase: 'idle' }
                : { phase: 'failed', error: spans.error },
          });
          return;
        }
        const groups: PageGroup[] = spans.value.map((span) => ({
          kind: 'part',
          pages: pages.slice(span.from, span.to + 1),
          span: { from: span.from + 1, to: span.to + 1 },
        }));
        set({
          split: { phase: 'ready', spec, groups, sizes: spans.value.map((span) => span.size) },
        });
      },

      clearSplit() {
        set({ split: { phase: 'idle' } });
      },

      async startExport() {
        if (workspace().pages.length > 0)
          await runPlan(
            'pdf',
            buildExportPlan(workspace(), { base: baseName(), ...compressionOption() }),
            `${baseName()}.zip`,
          );
      },

      async extractSelection() {
        const plan = buildExtractPlan(workspace(), { base: baseName(), ...compressionOption() });
        if (plan !== undefined) await runPlan('extract', plan, `${baseName()}_extract.zip`);
      },

      async runSplit() {
        const split = get().split;
        if (split.phase !== 'ready') return;
        await runPlan(
          'split',
          buildSplitPlan(workspace(), split.groups, baseName(), compressionOption()),
          `${baseName()}_split.zip`,
        );
      },

      async exportImages(options, scope) {
        const pages = pagesFor(workspace(), scope);
        if (pages.length === 0 || busy()) return;
        const jobId = ++jobCounter;
        cancelActive = () => {
          deps.renderWorker().cancelJob(jobId);
        };
        set({ job: { phase: 'running', job: 'images', done: 0, total: pages.length } });
        const outcome = await deps
          .renderWorker()
          .exportImages(
            jobId,
            pages.map(toImageJobPage),
            options,
            stripExtension(baseName()),
            progressTo(jobId),
          )
          .catch(failedOutright);
        finish('images', outcome);
      },

      cancelJob() {
        cancelActive?.();
      },

      async saveResult() {
        const state = get().job;
        if (state.phase !== 'ready') return;
        try {
          await deps.save(state.result.bytes, state.result.name, state.result.mime);
        } catch {
          // The file stays ready, so pressing Save again is all it takes.
          return;
        }
        set({ job: { phase: 'idle' } });
      },

      dismissJob() {
        set({ job: { phase: 'idle' } });
      },
    };
  });
}

/** Bytes of PDF data held for the loaded files (what the memory warning looks at). */
export function totalLoadedBytes(workspace: Workspace): number {
  return workspace.sources.reduce((total, source) => total + source.size, 0);
}
