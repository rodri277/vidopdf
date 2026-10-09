import { useEffect } from 'react';
import { useSession } from '../state/session';

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/**
 * Two things the browser would otherwise do that lose the user's work: open a file dropped
 * anywhere outside the page area in place of the app, and close or reload the tab without a word
 * while pages are loaded (nothing is kept between visits, on purpose).
 */
export function useWindowGuards(onFiles: (files: File[]) => void): void {
  useEffect(() => {
    const over = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      // The page area handles its own drops; this catches the rest of the window.
      if (event.defaultPrevented || !carriesFiles(event)) return;
      event.preventDefault();
      if (document.querySelector('dialog[open]') !== null) return;
      onFiles([...(event.dataTransfer?.files ?? [])]);
    };
    const leaving = (event: BeforeUnloadEvent) => {
      if (useSession.getState().session.workspace.pages.length === 0) return;
      event.preventDefault();
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('beforeunload', leaving);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('beforeunload', leaving);
    };
  }, [onFiles]);
}
