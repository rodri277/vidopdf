import { create } from 'zustand';
import type { ExportPage, PdfErrorKind, RenderedPage } from '@vidopdf/core';
import { browserFileIO } from '../adapters/file-io';
import { exportWorker, renderWorker } from '../workers/clients';

export type RejectionKind = PdfErrorKind | 'notPdf';

export interface LoadedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly pageCount: number;
  readonly color: string;
  readonly bytes: Uint8Array;
  readonly thumbnail: RenderedPage<ImageBitmap> | undefined;
}

export interface Rejection {
  readonly id: string;
  readonly name: string;
  readonly kind: RejectionKind;
}

export type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'exporting' }
  | { readonly kind: 'exported'; readonly bytes: number };

interface WorkspaceState {
  files: readonly LoadedFile[];
  rejections: readonly Rejection[];
  status: Status;
  addFiles: (files: readonly File[]) => Promise<void>;
  exportAll: () => Promise<void>;
}

const COLORS = ['#5b8cff', '#f5a524', '#3ecf8e', '#c084fc', '#ff8a65', '#22d3ee'] as const;
const THUMBNAIL_WIDTH = 320;

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/** Copy of the bytes to hand to a worker: transferring would detach the one we keep. */
function forWorker(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

async function readOne(file: File, colorIndex: number): Promise<LoadedFile | Rejection> {
  const id = crypto.randomUUID();
  if (!isPdf(file)) return { id, name: file.name, kind: 'notPdf' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = await exportWorker().inspect(forWorker(bytes));
  if (!info.ok) return { id, name: file.name, kind: info.error.kind };
  const rendered = await renderWorker().renderFirstPage(forWorker(bytes), THUMBNAIL_WIDTH);
  return {
    id,
    name: file.name,
    size: bytes.byteLength,
    pageCount: info.value.pageCount,
    color: COLORS[colorIndex % COLORS.length] ?? '#5b8cff',
    bytes,
    thumbnail: rendered.ok ? rendered.value : undefined,
  };
}

function isLoaded(entry: LoadedFile | Rejection): entry is LoadedFile {
  return 'pageCount' in entry;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  files: [],
  rejections: [],
  status: { kind: 'idle' },

  async addFiles(incoming) {
    const loaded: LoadedFile[] = [];
    const rejected: Rejection[] = [];
    const offset = get().files.length;
    for (const file of incoming) {
      // One at a time: a damaged file reports its own error and never stops the others.
      const entry = await readOne(file, offset + loaded.length);
      if (isLoaded(entry)) loaded.push(entry);
      else rejected.push(entry);
    }
    set((state) => ({
      files: [...state.files, ...loaded],
      rejections: [...rejected],
    }));
  },

  async exportAll() {
    const { files } = get();
    if (files.length === 0) return;
    set({ status: { kind: 'exporting' } });
    const pages: ExportPage[] = files.flatMap((file) =>
      Array.from({ length: file.pageCount }, (_, pageIndex) => ({
        kind: 'original' as const,
        sourceId: file.id,
        pageIndex,
        rotation: 0 as const,
      })),
    );
    const sources = files.map((file) => [file.id, forWorker(file.bytes)] as const);
    const result = await exportWorker().assemble(sources, pages);
    if (!result.ok) {
      set({
        status: { kind: 'idle' },
        rejections: [{ id: 'export', name: '', kind: result.error.kind }],
      });
      return;
    }
    await browserFileIO.save(result.value, 'vidopdf-merged.pdf', 'application/pdf');
    set({ status: { kind: 'exported', bytes: result.value.byteLength } });
  },
}));
