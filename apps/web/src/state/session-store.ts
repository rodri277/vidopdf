import { create } from 'zustand';
import {
  addSource,
  buildExportPlan,
  clearSelection,
  createSession,
  deletePages,
  duplicatePages,
  emptyWorkspace,
  execute,
  insertBlankPage,
  movePagesToGap,
  redo,
  rotatePages,
  selectAll,
  selectMany,
  selectOnly,
  selectRange,
  toggleSelection,
  undo,
  withWorkspace,
} from '@vidopdf/core';
import type { Command, PdfErrorKind, Session, SourceFile, Workspace } from '@vidopdf/core';
import { browserFileIO } from '../adapters/file-io';
import { exportWorker, renderWorker } from '../workers/clients';
import { proxy, transfer } from 'comlink';

export type RejectionKind = PdfErrorKind | 'notPdf';

export interface Rejection {
  readonly id: string;
  readonly name: string;
  readonly kind: RejectionKind;
}

export type ExportState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running'; readonly done: number; readonly total: number }
  | { readonly phase: 'ready'; readonly bytes: Uint8Array; readonly pageCount: number }
  | { readonly phase: 'failed'; readonly kind: PdfErrorKind };

/** A4 in PDF points: the size of a page inserted without a reference. */
const BLANK_SIZE = { width: 595, height: 842 } as const;
/** SPEC: soft warning above this much loaded PDF data. */
export const MEMORY_WARNING_BYTES = 250 * 1024 * 1024;

interface SessionState {
  session: Session;
  rejections: readonly Rejection[];
  /** Files being read right now (shown as progress). */
  loading: number;
  exportState: ExportState;
  addFiles: (files: readonly File[]) => Promise<void>;
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
  startExport: () => Promise<void>;
  cancelExport: () => void;
  saveExport: () => Promise<void>;
  dismissExport: () => void;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
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

interface Loaded {
  readonly source: SourceFile;
}

/** Reads one file and hands its bytes to both workers. A failure becomes a Rejection, never a throw. */
async function loadFile(file: File): Promise<Loaded | Rejection> {
  const id = crypto.randomUUID();
  if (!isPdf(file)) return { id, name: file.name, kind: 'notPdf' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fingerprint = await fingerprintOf(bytes, file);
  const forExport = bytes.slice();
  const info = await exportWorker().register(id, transfer(forExport, [forExport.buffer]));
  if (!info.ok) return { id, name: file.name, kind: info.error.kind };
  const forRender = bytes.slice();
  const opened = await renderWorker().open(id, transfer(forRender, [forRender.buffer]));
  if (!opened.ok) {
    void exportWorker().release(id);
    return { id, name: file.name, kind: opened.error.kind };
  }
  const source: SourceFile = {
    id,
    name: file.name,
    pageCount: info.value.pageCount,
    size: bytes.byteLength,
    fingerprint,
    encrypted: false,
  };
  return { source };
}

function isLoaded(entry: Loaded | Rejection): entry is Loaded {
  return 'source' in entry;
}

function pagesOf(source: SourceFile) {
  return Array.from({ length: source.pageCount }, (_, sourceIndex) => ({
    kind: 'original' as const,
    id: crypto.randomUUID(),
    sourceId: source.id,
    sourceIndex,
    rotation: 0 as const,
  }));
}

let exportCounter = 0;
let activeExport: number | undefined;

export const useSession = create<SessionState>((set, get) => {
  const run = (command: Command) => {
    set((state) => ({ session: execute(state.session, command) }));
  };
  const editWorkspace = (change: (workspace: Workspace) => Workspace) => {
    set((state) => ({ session: withWorkspace(state.session, change(state.session.workspace)) }));
  };
  const selection = () => get().session.workspace.selection;

  return {
    session: createSession(emptyWorkspace),
    rejections: [],
    loading: 0,
    exportState: { phase: 'idle' },

    async addFiles(files) {
      set({ rejections: [] });
      set((state) => ({ loading: state.loading + files.length }));
      for (const file of files) {
        // One at a time: a damaged file reports its own error and never stops the others.
        const entry = await loadFile(file);
        set((state) => ({ loading: state.loading - 1 }));
        if (isLoaded(entry)) {
          const pages = pagesOf(entry.source);
          run(addSource(entry.source, pages)(get().session.workspace));
        } else {
          set((state) => ({ rejections: [...state.rejections, entry] }));
        }
      }
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
      const ids = selection();
      if (ids.length > 0) run(rotatePages(ids, degrees));
    },
    deleteSelected() {
      const ids = selection();
      if (ids.length > 0) run(deletePages(ids));
    },
    duplicateSelected() {
      const ids = selection();
      if (ids.length === 0) return;
      run(
        duplicatePages(
          get().session.workspace,
          ids,
          ids.map(() => crypto.randomUUID()),
        ),
      );
    },
    insertBlankAfterSelection() {
      const { workspace } = get().session;
      const last = workspace.selection.at(-1);
      const after =
        last === undefined
          ? workspace.pages.length
          : workspace.pages.findIndex((p) => p.id === last) + 1;
      const page = {
        kind: 'blank' as const,
        id: crypto.randomUUID(),
        ...BLANK_SIZE,
        rotation: 0 as const,
      };
      run(insertBlankPage(workspace, page, after));
    },
    moveSelectedToGap(gap) {
      const { workspace } = get().session;
      if (workspace.selection.length > 0) run(movePagesToGap(workspace, workspace.selection, gap));
    },

    undo: () => {
      set((state) => ({ session: undo(state.session) }));
    },
    redo: () => {
      set((state) => ({ session: redo(state.session) }));
    },

    async startExport() {
      const { workspace } = get().session;
      if (workspace.pages.length === 0 || get().exportState.phase === 'running') return;
      const plan = buildExportPlan(workspace);
      const pages = plan.steps.flatMap((step) => step.pages);
      const exportId = ++exportCounter;
      activeExport = exportId;
      set({ exportState: { phase: 'running', done: 0, total: pages.length } });
      const result = await exportWorker().assemble(
        exportId,
        pages,
        proxy((done: number, total: number) => {
          // Progress travels on its own message channel and can arrive after the result, so it
          // may only update an export that is still running.
          const current = get().exportState;
          if (activeExport === exportId && current.phase === 'running' && done > current.done) {
            set({ exportState: { phase: 'running', done, total } });
          }
        }),
      );
      if (activeExport !== exportId) return;
      set({
        exportState: result.ok
          ? { phase: 'ready', bytes: result.value, pageCount: pages.length }
          : result.error.kind === 'cancelled'
            ? { phase: 'idle' }
            : { phase: 'failed', kind: result.error.kind },
      });
    },
    cancelExport() {
      if (activeExport !== undefined) void exportWorker().cancel(activeExport);
    },
    async saveExport() {
      const state = get().exportState;
      if (state.phase !== 'ready') return;
      await browserFileIO.save(state.bytes, 'vidopdf.pdf', 'application/pdf');
      set({ exportState: { phase: 'idle' } });
    },
    dismissExport() {
      set({ exportState: { phase: 'idle' } });
    },
  };
});

export function totalLoadedBytes(workspace: Workspace): number {
  return workspace.sources.reduce((total, source) => total + source.size, 0);
}
