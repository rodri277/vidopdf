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
  cropPages,
  fromOutlines,
  shownImageSize,
  SIZE_PROBE_BYTES,
  isRestricted,
  placeOverlay,
  removeOverlay,
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
  setFields,
  selectAll,
  selectMany,
  selectOnly,
  selectRange,
  stripExtension,
  suggestedBaseName,
  toggleSelection,
  undo,
  withWorkspace,
  hasMetadata,
} from '@vidopdf/core';
import type {
  ImageSize,
  BookmarkMode,
  BookmarkNode,
  Command,
  ExportOptions,
  FormInfo,
  FormMode,
  FormValue,
  CompressionPreset,
  ExportPlan,
  ImageExportOptions,
  ImageFormat,
  ImagePageOptions,
  Margins,
  MetadataSettings,
  Permissions,
  ProtectChoice,
  Overlay,
  OutlineEntry,
  PageGroup,
  PageRef,
  PdfErrorKind,
  Session,
  SourceFile,
  SplitError,
  Stamp,
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

/** What the user is typing to protect the next export. Kept in memory only, never in the history. */
export interface ProtectDraft {
  readonly userPassword: string;
  readonly confirm: string;
  readonly ownerPassword: string;
  readonly permissions: Permissions;
}

/** The choice to hand to the export, or undefined while the draft is not complete. */
export function protectChoiceOf(draft: ProtectDraft | undefined): ProtectChoice | undefined {
  if (draft === undefined) return undefined;
  const opens = draft.userPassword !== '' && draft.userPassword === draft.confirm;
  const restricts = isRestricted(draft.permissions);
  if (!opens && !restricts) return undefined;
  if (draft.userPassword !== '' && !opens) return undefined;
  return {
    userPassword: draft.userPassword,
    ownerPassword: draft.ownerPassword,
    permissions: draft.permissions,
  };
}

/** Protection was asked for but is not complete (passwords that do not match): do not export yet. */
export function protectIncomplete(draft: ProtectDraft | undefined): boolean {
  return draft !== undefined && protectChoiceOf(draft) === undefined;
}

/** A protected file waiting for its password. The password itself is never kept in the state. */
export interface PasswordRequest {
  readonly id: string;
  readonly file: File;
  /** The last password tried was not the right one. */
  readonly wrong: boolean;
}

export interface PendingImage {
  readonly id: string;
  readonly file: File;
  /** Pixels as the picture is seen, read from its header; unknown when the header is unusual. */
  readonly size?: ImageSize;
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
  /** Pixel size of a picture, or undefined if the browser cannot read it. */
  readonly imageSize: (file: Blob) => Promise<{ width: number; height: number } | undefined>;
  readonly objectUrl: (blob: Blob) => string;
  readonly revokeUrl: (url: string) => void;
}

/** A4 in PDF points: the size of a page inserted without a reference. */
const BLANK_SIZE = { width: 595, height: 842 } as const;

/** A picture the user gave for a stamp or a signature. The bytes live in the export worker. */
export interface AssetInfo {
  readonly id: string;
  readonly name: string;
  readonly mime: 'image/png' | 'image/jpeg';
  /** Height divided by width. */
  readonly aspect: number;
  /** Object URL for showing it in the interface. */
  readonly url: string;
}

export type AssetProblem = 'unsupported' | 'unreadable';

/** The stamps the simple forms manage, in the order they are drawn. */
export const STAMP_ORDER = ['header', 'footer', 'pageNumber', 'watermark'] as const;
export type StampSlot = (typeof STAMP_ORDER)[number];

export interface SessionState {
  session: Session;
  rejections: readonly Rejection[];
  /** Files being read right now (shown as progress). */
  loading: number;
  /** Protected files waiting for their password, asked one at a time. */
  passwordRequests: readonly PasswordRequest[];
  /** Pictures waiting for the user to choose how they become pages. */
  pendingImages: readonly PendingImage[];
  /** Bookmarks of each source, loaded on demand. */
  outlines: Readonly<Record<string, readonly OutlineEntry[]>>;
  /** Picture formats this browser can write; undefined until asked. */
  encodable: readonly ImageFormat[] | undefined;
  job: JobState;
  split: SplitPreview;
  assets: Readonly<Record<string, AssetInfo>>;
  /** The fields of each loaded file's form, read on demand. */
  forms: Readonly<Record<string, FormInfo>>;
  /** How the next export is protected, while the user is setting it. */
  protect: ProtectDraft | undefined;
  setProtect: (draft: ProtectDraft | undefined) => void;
  /** Applies to every PDF the app builds: the whole file, an extract and the parts of a split. */
  compression: CompressionChoice;
  setCompression: (choice: CompressionChoice) => void;
  /** Sets or removes (null) the stamp of a slot; consecutive changes of one `field` are one undo step. */
  setStamp: (slot: StampSlot, stamp: Stamp | null, field?: string) => void;
  setMetadata: (metadata: MetadataSettings) => void;
  /**
   * Takes the title, author, subject and keywords a loaded file has. Fields the file leaves empty
   * are left as they are. Resolves to whether the file had anything.
   */
  importMetadata: (sourceId: string) => Promise<boolean>;
  /** Keep the bookmarks of the files (auto), edit them by hand (custom) or write none. */
  setBookmarkMode: (mode: BookmarkMode) => void;
  /** Changes the hand-made tree; changes with the same `field` merge into one undo step. */
  editBookmarks: (
    change: (nodes: readonly BookmarkNode[]) => BookmarkNode[],
    field?: string,
  ) => void;
  /** Starts a hand-made tree from the bookmarks of the loaded files. */
  importBookmarks: () => Promise<void>;
  /** Reads the form fields of the loaded files that have not been read yet. */
  loadForms: () => Promise<void>;
  /** Sets what is typed in one field of one file; typing in one field is one undo step. */
  setFormValue: (sourceId: string, name: string, value: FormValue) => void;
  setFormMode: (mode: FormMode) => void;
  /** Puts a signature picture on a page, or moves or resizes one that is there (dragging is one undo step). */
  placeSignature: (pageId: string, overlay: Overlay) => void;
  removeSignature: (pageId: string, overlayId: string) => void;
  /** Crops the selected pages (as the reader sees them); no margins removes the crop. */
  cropSelected: (margins: Margins | undefined) => void;
  addAsset: (file: File) => Promise<AssetInfo | AssetProblem>;
  removeAsset: (id: string) => void;
  addFiles: (files: readonly File[]) => Promise<void>;
  addImages: (options: ImagePageOptions) => Promise<void>;
  discardImages: () => void;
  /** Opens a protected file with the password the user typed; a wrong one asks again. */
  submitPassword: (requestId: string, password: string) => Promise<void>;
  /** Gives up on a protected file: it is not opened and the user is told so. */
  skipPassword: (requestId: string) => void;
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
    const protect = output.steps.find((step) => step.kind === 'protect');
    return {
      name: output.name,
      pages: assemble?.kind === 'assemble' ? assemble.pages : [],
      ...(assemble?.kind === 'assemble' ? { decorations: assemble.decorations } : {}),
      ...(compression === undefined ? {} : { compression }),
      ...(protect?.kind === 'protect'
        ? {
            protect: {
              ...(protect.userPassword === undefined ? {} : { userPassword: protect.userPassword }),
              ...(protect.ownerPassword === undefined
                ? {}
                : { ownerPassword: protect.ownerPassword }),
              permissions: protect.permissions,
            },
          }
        : {}),
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
      ) => Promise<
        { pageCount: number; restrictions?: number; forRender?: Uint8Array } | PdfErrorKind
      >,
      password?: string,
    ): Promise<Loaded | Rejection> {
      const id = deps.newId();
      try {
        return await registerAs(id, file, send, password);
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
      ) => Promise<
        { pageCount: number; restrictions?: number; forRender?: Uint8Array } | PdfErrorKind
      >,
      password?: string,
    ): Promise<Loaded | Rejection> {
      const bytes = await readFresh(file);
      const fingerprint = await fingerprintOf(bytes, file);
      const sent = await send(id, bytes);
      if (typeof sent === 'string') return { id, name: file.name, kind: sent };
      const forRender = sent.forRender ?? (await readFresh(file));
      const opened = await deps
        .renderWorker()
        .open(id, transfer(forRender, [forRender.buffer]), password);
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
        encrypted: password !== undefined,
        ...(sent.restrictions === undefined ? {} : { restrictions: sent.restrictions }),
      };
      return { source };
    }

    function loadPdf(file: File, password?: string): Promise<Loaded | Rejection> {
      return register(
        file,
        async (id, bytes) => {
          const info = await deps
            .exportWorker()
            .register(id, transfer(bytes, [bytes.buffer]), password);
          return info.ok
            ? {
                pageCount: info.value.pageCount,
                ...(info.value.restrictions === undefined
                  ? {}
                  : { restrictions: info.value.restrictions }),
              }
            : info.error.kind;
        },
        password,
      );
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
      if (kind.kind === 'pdf') askOrAdopt(file, await loadPdf(file));
      else if (kind.kind === 'image') {
        const probe = new Uint8Array(await file.slice(0, SIZE_PROBE_BYTES).arrayBuffer());
        const size = shownImageSize(probe);
        set((state) => ({
          pendingImages: [
            ...state.pendingImages,
            { id: deps.newId(), file, ...(size === undefined ? {} : { size }) },
          ],
        }));
      } else adopt({ id: deps.newId(), name: file.name, kind: kind.reason });
    }

    /** A file that needs a password waits for it; anything else is taken in or turned down. */
    function askOrAdopt(file: File, entry: Loaded | Rejection): void {
      if (!isLoaded(entry) && entry.kind === 'passwordRequired') {
        set((state) => ({
          passwordRequests: [...state.passwordRequests, { id: deps.newId(), file, wrong: false }],
        }));
        return;
      }
      adopt(entry);
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

    /**
     * Starts a job at once (so the dialog shows it) and builds its plan afterwards, because the
     * plan needs the bookmarks of the files, which have to be read. A cancel in between is kept.
     */
    async function runPlan(
      job: JobKind,
      expected: number,
      makePlan: (options: ExportOptions) => ExportPlan | undefined,
      archiveName: string,
    ): Promise<void> {
      if (expected === 0 || busy()) return;
      const jobId = ++jobCounter;
      // An object, because the cancel arrives from somewhere else while the plan is being built.
      const stop = { requested: false };
      cancelActive = () => {
        stop.requested = true;
        deps.exportWorker().cancelJob(jobId);
      };
      const compressing = presetOf(get().compression) !== undefined;
      set({
        job: {
          phase: 'running',
          job,
          done: 0,
          total: expected,
          ...(compressing ? { compressing } : {}),
        },
      });
      const options = await exportOptions();
      const plan = stop.requested ? undefined : makePlan(options);
      const outputs = plan === undefined ? [] : toPlanned(plan);
      if (outputs.length === 0) {
        cancelActive = undefined;
        set({ job: { phase: 'idle' } });
        return;
      }
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

    /** The bookmark tree to write: the files' own, the hand-made one, or none. */
    async function bookmarkNodes(mode: BookmarkMode): Promise<BookmarkNode[]> {
      const ws = workspace();
      if (mode === 'none') return [];
      if (mode === 'custom') return [...ws.bookmarks.nodes];
      await get().loadOutlines();
      const outlines = ws.sources.map((source) => ({
        sourceId: source.id,
        entries: get().outlines[source.id] ?? [],
      }));
      return fromOutlines(outlines, ws.pages, deps.newId);
    }

    const baseName = () => suggestedBaseName(workspace());
    /** What every export takes besides its pages: compression, the day, the bookmarks. */
    const exportOptions = async () => {
      const preset = presetOf(get().compression);
      // The day of export, in the user's own calendar, for {date} in a stamp.
      const date = new Date().toLocaleDateString('sv-SE');
      const bookmarks = await bookmarkNodes(workspace().bookmarks.mode);
      const choice = protectChoiceOf(get().protect);
      return {
        date,
        bookmarks,
        ...(preset === undefined ? {} : { compression: preset }),
        ...(choice === undefined ? {} : { protect: choice }),
      };
    };

    return {
      session: createSession(emptyWorkspace),
      rejections: [],
      loading: 0,
      pendingImages: [],
      passwordRequests: [],
      outlines: {},
      encodable: undefined,
      job: { phase: 'idle' },
      split: { phase: 'idle' },
      compression: 'off',
      assets: {},
      forms: {},
      protect: undefined,

      setProtect(protect) {
        set({ protect });
      },

      setCompression(compression) {
        set({ compression });
      },

      setStamp(slot, stamp, field) {
        const others = workspace().stamps.filter((candidate) => candidate.id !== slot);
        const stamps = (stamp === null ? others : [...others, { ...stamp, id: slot }]).sort(
          (a, b) => STAMP_ORDER.indexOf(a.id as StampSlot) - STAMP_ORDER.indexOf(b.id as StampSlot),
        );
        // Only changes to the same field merge (typing one text); turning a stamp on or off never does.
        run(
          setFields(
            'stamps',
            { stamps },
            field === undefined ? undefined : `stamp:${slot}:${field}`,
          ),
        );
      },

      cropSelected(margins) {
        const ws = workspace();
        const originals = new Set(
          ws.pages.filter((page) => page.kind === 'original').map((page) => page.id),
        );
        const ids = ws.selection.filter((id) => originals.has(id));
        // Dragging an edge is one undo step; a different set of pages is a new one.
        if (ids.length > 0) run(cropPages(ws, ids, margins, `crop:${ids.join(',')}`));
      },

      setBookmarkMode(mode) {
        run(setFields('bookmarks', { bookmarks: { ...workspace().bookmarks, mode } }));
      },

      editBookmarks(change, field) {
        const current = workspace().bookmarks;
        const nodes = change(current.nodes);
        const mergeKey = field === undefined ? undefined : `bookmarks:${field}`;
        run(setFields('bookmarks', { bookmarks: { mode: 'custom', nodes } }, mergeKey));
      },

      async loadForms() {
        const missing = workspace().sources.filter(
          (source) => get().forms[source.id] === undefined,
        );
        const read = await Promise.all(
          missing.map(async (source) => {
            const info = await deps.exportWorker().readForm(source.id).catch(failedOutright);
            return info.ok ? ([source.id, info.value] as const) : undefined;
          }),
        );
        const found: Record<string, FormInfo> = {};
        for (const entry of read) if (entry !== undefined) found[entry[0]] = entry[1];
        set((state) => ({ forms: { ...state.forms, ...found } }));
      },

      setFormValue(sourceId, name, value) {
        const current = workspace().forms;
        const forms = { ...current, [sourceId]: { ...current[sourceId], [name]: value } };
        run(setFields('forms', { forms }, `form:${sourceId}:${name}`));
      },

      setFormMode(formMode) {
        run(setFields('forms', { formMode }));
      },

      placeSignature(pageId, overlay) {
        const ws = workspace();
        const page = ws.pages.find((candidate) => candidate.id === pageId);
        if (page?.kind !== 'original') return;
        run(placeOverlay(ws, pageId, overlay, `signature:${overlay.id}`));
      },

      removeSignature(pageId, overlayId) {
        run(removeOverlay(workspace(), pageId, overlayId));
      },

      async importBookmarks() {
        const nodes = await bookmarkNodes('auto');
        run(setFields('bookmarks', { bookmarks: { mode: 'custom', nodes } }));
      },

      setMetadata(metadata) {
        run(setFields('metadata', { metadata }, 'metadata'));
      },

      async importMetadata(sourceId) {
        const read = await deps.renderWorker().metadata(sourceId).catch(failedOutright);
        if (!read.ok || !hasMetadata(read.value)) return false;
        const current = workspace().metadata;
        const found = read.value;
        run(
          setFields('metadata', {
            metadata: {
              title: found.title === '' ? current.title : found.title,
              author: found.author === '' ? current.author : found.author,
              subject: found.subject === '' ? current.subject : found.subject,
              keywords: found.keywords.length === 0 ? current.keywords : found.keywords,
            },
          }),
        );
        return true;
      },

      async addAsset(file) {
        const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
        const kind = classifyFile(head, file.name, file.type);
        if (kind.kind !== 'image') return 'unsupported';
        const size = await deps.imageSize(file);
        if (size === undefined || size.width === 0) return 'unreadable';
        const id = deps.newId();
        const bytes = await readFresh(file);
        deps.exportWorker().registerAsset(id, transfer(bytes, [bytes.buffer]));
        const info: AssetInfo = {
          id,
          name: file.name,
          mime: kind.format === 'png' ? 'image/png' : 'image/jpeg',
          aspect: size.height / size.width,
          url: deps.objectUrl(file),
        };
        set((state) => ({ assets: { ...state.assets, [id]: info } }));
        return info;
      },

      removeAsset(id) {
        const info = get().assets[id];
        if (info === undefined) return;
        deps.revokeUrl(info.url);
        deps.exportWorker().releaseAsset(id);
        set((state) => ({
          assets: Object.fromEntries(Object.entries(state.assets).filter(([key]) => key !== id)),
        }));
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

      async submitPassword(requestId, password) {
        const request = get().passwordRequests.find((candidate) => candidate.id === requestId);
        if (request === undefined) return;
        const entry = await loadPdf(request.file, password);
        if (
          !isLoaded(entry) &&
          (entry.kind === 'wrongPassword' || entry.kind === 'passwordRequired')
        ) {
          set((state) => ({
            passwordRequests: state.passwordRequests.map((candidate) =>
              candidate.id === requestId ? { ...candidate, wrong: true } : candidate,
            ),
          }));
          return;
        }
        set((state) => ({
          passwordRequests: state.passwordRequests.filter(
            (candidate) => candidate.id !== requestId,
          ),
        }));
        adopt(entry);
      },

      skipPassword(requestId) {
        const request = get().passwordRequests.find((candidate) => candidate.id === requestId);
        if (request === undefined) return;
        set((state) => ({
          passwordRequests: state.passwordRequests.filter(
            (candidate) => candidate.id !== requestId,
          ),
        }));
        adopt({ id: deps.newId(), name: request.file.name, kind: 'encrypted' });
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
            {
              decorations: decorationsForMeasuring(workspace()),
              edits: workspace().edits,
              ...(protectChoiceOf(get().protect) === undefined ? {} : { protect: true }),
            },
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
        await runPlan(
          'pdf',
          workspace().pages.length,
          (options) => buildExportPlan(workspace(), { base: baseName(), ...options }),
          `${baseName()}.zip`,
        );
      },

      async extractSelection() {
        await runPlan(
          'extract',
          workspace().selection.length,
          (options) => buildExtractPlan(workspace(), { base: baseName(), ...options }),
          `${baseName()}_extract.zip`,
        );
      },

      async runSplit() {
        const split = get().split;
        if (split.phase !== 'ready') return;
        await runPlan(
          'split',
          split.groups.reduce((total, group) => total + group.pages.length, 0),
          (options) => buildSplitPlan(workspace(), split.groups, baseName(), options),
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
        // Passwords are not kept once the file is saved.
        set({ job: { phase: 'idle' }, protect: undefined });
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
