import { indexOfPage, inDocumentOrder } from './workspace';
import type { Workspace } from './workspace';

export function clearSelection(workspace: Workspace): Workspace {
  return { ...workspace, selection: [], anchor: null };
}

export function selectAll(workspace: Workspace): Workspace {
  const first = workspace.pages[0];
  return {
    ...workspace,
    selection: workspace.pages.map((page) => page.id),
    anchor: first?.id ?? null,
  };
}

/** Plain click: only this page. */
export function selectOnly(workspace: Workspace, id: string): Workspace {
  return indexOfPage(workspace, id) < 0 ? workspace : { ...workspace, selection: [id], anchor: id };
}

/** Ctrl or Cmd click: adds the page, or removes it if it was already selected. */
export function toggleSelection(workspace: Workspace, id: string): Workspace {
  if (indexOfPage(workspace, id) < 0) return workspace;
  const selected = new Set(workspace.selection);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return { ...workspace, selection: inDocumentOrder(workspace, selected), anchor: id };
}

/** Shift click: everything between the anchor and this page. The anchor stays put. */
export function selectRange(workspace: Workspace, id: string): Workspace {
  const to = indexOfPage(workspace, id);
  if (to < 0) return workspace;
  const from = workspace.anchor === null ? -1 : indexOfPage(workspace, workspace.anchor);
  if (from < 0) return selectOnly(workspace, id);
  const [start, end] = from <= to ? [from, to] : [to, from];
  const ids = workspace.pages.slice(start, end + 1).map((page) => page.id);
  return { ...workspace, selection: ids };
}

/** Rubber band: the pages under the rectangle, optionally added to the current selection. */
export function selectMany(
  workspace: Workspace,
  ids: readonly string[],
  additive: boolean,
): Workspace {
  const merged = additive ? [...workspace.selection, ...ids] : ids;
  const selection = inDocumentOrder(workspace, merged);
  return { ...workspace, selection, anchor: selection[0] ?? null };
}
