import { useEffect } from 'react';
import { pageAt } from '../legal/route';
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

/**
 * The page shortcuts only make sense with the pages on screen: not behind a dialog (they would
 * change pages the user cannot see, and a split already worked out would go stale) and not on a
 * legal page, where the browser's own Ctrl+A is the one that should select the text.
 */
function pagesOutOfSight(): boolean {
  return (
    document.querySelector('dialog[open]') !== null ||
    pageAt(window.location.pathname) !== undefined
  );
}

export function useShortcuts(onAddFiles: () => void): void {
  useEffect(() => {
    const run: Record<ShortcutIntent, () => void> = {
      undo: undoAction,
      redo: redoAction,
      selectAll: selectAllPages,
      duplicate: duplicateSelection,
      addFiles: onAddFiles,
      export: () => {
        if (useSession.getState().session.workspace.pages.length > 0) useUi.getState().openExport();
      },
      rotateRight: () => {
        rotateSelection(90);
      },
      rotateLeft: () => {
        rotateSelection(-90);
      },
      delete: deleteSelection,
    };
    const handle = (event: KeyboardEvent) => {
      if (isTyping(event.target) || useUi.getState().previewId !== null || pagesOutOfSight())
        return;
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
