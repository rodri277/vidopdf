import { useEffect } from 'react';
import { useSession } from '../state/session';
import { useUi } from '../state/ui-store';
import {
  deleteSelection,
  duplicateSelection,
  redoAction,
  rotateSelection,
  selectAllPages,
  undoAction,
} from './actions';
import { interpretShortcut } from './keys';
import type { ShortcutIntent } from './keys';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function useShortcuts(onAddFiles: () => void): void {
  useEffect(() => {
    const run: Record<ShortcutIntent, () => void> = {
      undo: undoAction,
      redo: redoAction,
      selectAll: selectAllPages,
      duplicate: duplicateSelection,
      addFiles: onAddFiles,
      export: () => void useSession.getState().startExport(),
      rotateRight: () => {
        rotateSelection(90);
      },
      rotateLeft: () => {
        rotateSelection(-90);
      },
      delete: deleteSelection,
    };
    const handle = (event: KeyboardEvent) => {
      if (isTyping(event.target) || useUi.getState().previewId !== null) return;
      const intent = interpretShortcut(event, event.target === document.body);
      if (intent === undefined) return;
      event.preventDefault();
      run[intent]();
    };
    window.addEventListener('keydown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
    };
  }, [onAddFiles]);
}
