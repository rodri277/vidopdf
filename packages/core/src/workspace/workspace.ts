import type { PageRef } from './page-ref';

export interface SourceFile {
  readonly id: string;
  readonly name: string;
  readonly pageCount: number;
  /** Size in bytes. */
  readonly size: number;
  /** SHA-256 of the content, hex. Lets the UI notice the same file being added twice. */
  readonly fingerprint: string;
  readonly encrypted: boolean;
}

/**
 * The whole editable state: a plan made of page references, never copies of PDFs. Immutable;
 * every command returns a new one that shares everything it did not touch.
 */
export interface Workspace {
  readonly sources: readonly SourceFile[];
  readonly pages: readonly PageRef[];
  /** Ids of the selected pages, in document order. */
  readonly selection: readonly string[];
  /** Where a shift-click range starts. */
  readonly anchor: string | null;
}

export const emptyWorkspace: Workspace = { sources: [], pages: [], selection: [], anchor: null };

export function indexOfPage(workspace: Workspace, id: string): number {
  return workspace.pages.findIndex((page) => page.id === id);
}

/** Replaces the page list and drops selection entries that no longer exist. */
export function withPages(workspace: Workspace, pages: readonly PageRef[]): Workspace {
  const alive = new Set(pages.map((page) => page.id));
  const selection = workspace.selection.filter((id) => alive.has(id));
  const anchor = workspace.anchor !== null && alive.has(workspace.anchor) ? workspace.anchor : null;
  return { ...workspace, pages, selection, anchor };
}

/** Keeps `ids` in document order, which is how the selection is always stored. */
export function inDocumentOrder(workspace: Workspace, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return workspace.pages.filter((page) => wanted.has(page.id)).map((page) => page.id);
}
