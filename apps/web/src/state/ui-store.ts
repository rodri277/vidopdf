import { create } from 'zustand';

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

interface UiState {
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
