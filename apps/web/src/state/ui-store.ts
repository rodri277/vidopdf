import { create } from 'zustand';
import { DEFAULT_DPI, DEFAULT_QUALITY } from '@vidopdf/core';
import type { ImageFormat } from '@vidopdf/core';
import { defaultSplitDraft } from './split';
import type { SplitDraft } from './split';

const SIZE_KEY = 'vidopdf.thumbnailSize';
export const THUMB_MIN = 120;
export const THUMB_MAX = 280;
const THUMB_DEFAULT = 180;

function clampSize(value: number): number {
  return Math.min(THUMB_MAX, Math.max(THUMB_MIN, Math.round(value)));
}

function initialSize(): number {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampSize(saved) : THUMB_DEFAULT;
  } catch {
    return THUMB_DEFAULT;
  }
}

export type ExportMode = 'pdf' | 'split' | 'images';
export type DocumentTab = 'numbering' | 'watermark' | 'metadata';

/** What the picture form holds. */
export interface ImageDraft {
  readonly format: ImageFormat;
  readonly dpi: number;
  readonly quality: number;
  readonly scope: 'all' | 'selection';
}

interface UiState {
  /** The export dialog, with its form. A running job keeps the dialog open on its own. */
  exportOpen: boolean;
  exportMode: ExportMode;
  splitDraft: SplitDraft;
  imageDraft: ImageDraft;
  openExport: (mode?: ExportMode, split?: SplitDraft) => void;
  closeExport: () => void;
  setExportMode: (mode: ExportMode) => void;
  patchSplit: (changes: Partial<SplitDraft>) => void;
  patchImages: (changes: Partial<ImageDraft>) => void;
  /** The dialog for what is stamped and written into the output. */
  documentOpen: boolean;
  documentTab: DocumentTab;
  /** The dialog that crops the selected pages. */
  cropOpen: boolean;
  openCrop: () => void;
  closeCrop: () => void;
  openDocument: (tab?: DocumentTab) => void;
  closeDocument: () => void;
  setDocumentTab: (tab: DocumentTab) => void;
  /** The page the keyboard is on (not necessarily selected). */
  activeId: string | null;
  thumbSize: number;
  /** Last message for screen readers; shown in an aria-live region. */
  announcement: string;
  previewId: string | null;
  setActive: (id: string | null) => void;
  setThumbSize: (size: number) => void;
  announce: (message: string) => void;
  openPreview: (id: string) => void;
  closePreview: () => void;
}

export const useUi = create<UiState>((set) => ({
  exportOpen: false,
  exportMode: 'pdf',
  splitDraft: defaultSplitDraft,
  imageDraft: { format: 'png', dpi: DEFAULT_DPI, quality: DEFAULT_QUALITY, scope: 'all' },
  cropOpen: false,
  openCrop: () => {
    set({ cropOpen: true });
  },
  closeCrop: () => {
    set({ cropOpen: false });
  },
  documentOpen: false,
  documentTab: 'numbering',
  openDocument: (tab) => {
    set((state) => ({ documentOpen: true, documentTab: tab ?? state.documentTab }));
  },
  closeDocument: () => {
    set({ documentOpen: false });
  },
  setDocumentTab: (documentTab) => {
    set({ documentTab });
  },
  openExport: (mode, split) => {
    set((state) => ({
      exportOpen: true,
      exportMode: mode ?? state.exportMode,
      splitDraft: split ?? state.splitDraft,
    }));
  },
  closeExport: () => {
    set({ exportOpen: false });
  },
  setExportMode: (exportMode) => {
    set({ exportMode });
  },
  patchSplit: (changes) => {
    set((state) => ({ splitDraft: { ...state.splitDraft, ...changes } }));
  },
  patchImages: (changes) => {
    set((state) => ({ imageDraft: { ...state.imageDraft, ...changes } }));
  },
  activeId: null,
  thumbSize: initialSize(),
  announcement: '',
  previewId: null,
  setActive: (activeId) => {
    set({ activeId });
  },
  setThumbSize: (size) => {
    const thumbSize = clampSize(size);
    try {
      localStorage.setItem(SIZE_KEY, String(thumbSize));
    } catch {
      // The preference simply is not remembered when storage is blocked.
    }
    set({ thumbSize });
  },
  announce: (announcement) => {
    // Clearing first makes a repeated message be read again.
    set({ announcement: '' });
    queueMicrotask(() => {
      set({ announcement });
    });
  },
  openPreview: (previewId) => {
    set({ previewId });
  },
  closePreview: () => {
    set({ previewId: null });
  },
}));
