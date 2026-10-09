import { indexOfPage, redoLabel, undoLabel } from '@vidopdf/core';
import type { CommandLabel } from '@vidopdf/core';
import { i18next } from '../i18n';
import { useSession } from '../state/session-store';
import { useUi } from '../state/ui-store';

/**
 * Everything the user can do to the pages, in one place: buttons, shortcuts and the grid all call
 * these, so each action also tells screen readers what happened.
 */
const say = (message: string) => {
  useUi.getState().announce(message);
};
const workspace = () => useSession.getState().session.workspace;

function describe(label: CommandLabel): string {
  return `${i18next.t(`history.${label.kind}`)} (${String(label.count)})`;
}

export function rotateSelection(degrees: number): void {
  const count = workspace().selection.length;
  if (count === 0) return;
  useSession.getState().rotateSelected(degrees);
  say(i18next.t('announce.rotated', { count, degrees: ((degrees % 360) + 360) % 360 }));
}

export function deleteSelection(): void {
  const before = workspace();
  const count = before.selection.length;
  if (count === 0) return;
  const firstIndex = indexOfPage(before, before.selection[0] ?? '');
  useSession.getState().deleteSelected();
  const after = workspace();
  // Keep the keyboard where the deleted pages were, instead of losing it.
  useUi.getState().setActive(after.pages[Math.min(firstIndex, after.pages.length - 1)]?.id ?? null);
  say(i18next.t('announce.deleted', { count }));
}

export function duplicateSelection(): void {
  const count = workspace().selection.length;
  if (count === 0) return;
  useSession.getState().duplicateSelected();
  say(i18next.t('announce.duplicated', { count }));
}

export function insertBlankPage(): void {
  useSession.getState().insertBlankAfterSelection();
  const { selection, pages } = workspace();
  const id = selection[0];
  if (id === undefined) return;
  useUi.getState().setActive(id);
  say(i18next.t('announce.blank', { n: pages.findIndex((page) => page.id === id) + 1 }));
}

/** Moves the selection into a gap of the page list and says where its first page ended up. */
export function moveSelectionToGap(gap: number): void {
  const before = workspace();
  const first = before.selection[0];
  if (first === undefined) return;
  const from = indexOfPage(before, first) + 1;
  useSession.getState().moveSelectedToGap(gap);
  const after = workspace();
  const to = indexOfPage(after, first) + 1;
  if (to === from && before.pages.every((page, i) => page.id === after.pages[i]?.id)) return;
  const count = after.selection.length;
  say(
    count === 1
      ? i18next.t('announce.moved', { from, to })
      : i18next.t('announce.movedMany', { count, to }),
  );
}

/** Alt + arrows: shift the selection by `delta` positions (1 for a page, the column count for a row). */
export function nudgeSelection(delta: number): void {
  const { pages, selection } = workspace();
  const indices = selection
    .map((id) => pages.findIndex((page) => page.id === id))
    .filter((i) => i >= 0);
  if (indices.length === 0) return;
  const first = Math.min(...indices);
  const last = Math.max(...indices);
  moveSelectionToGap(
    delta < 0 ? Math.max(0, first + delta) : Math.min(pages.length, last + 1 + delta),
  );
}

export function moveSelectionToEdge(edge: 'start' | 'end'): void {
  moveSelectionToGap(edge === 'start' ? 0 : workspace().pages.length);
}

export function undoAction(): void {
  const what = undoLabel(useSession.getState().session);
  if (what === undefined) return;
  useSession.getState().undo();
  say(i18next.t('announce.undone', { what: describe(what) }));
}

export function redoAction(): void {
  const what = redoLabel(useSession.getState().session);
  if (what === undefined) return;
  useSession.getState().redo();
  say(i18next.t('announce.redone', { what: describe(what) }));
}

export function selectAllPages(): void {
  useSession.getState().selectEverything();
  say(i18next.t('announce.selected', { count: workspace().selection.length }));
}
