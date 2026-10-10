import type { BookmarkSettings } from '../bookmarks/tree';
import { DEFAULT_BOOKMARKS } from '../bookmarks/tree';
import type { MetadataSettings } from '../document/metadata';
import { NO_METADATA } from '../document/metadata';
import type { FormMode, FormValues } from '../forms';
import type { EditsByPage } from '../pages/edits';
import type { Stamp } from '../stamps/stamp';
import type { PageRef } from './page-ref';

export interface SourceFile {
  readonly id: string;
  readonly name: string;
  readonly pageCount: number;
  /** Size in bytes. */
  readonly size: number;
  /** SHA-256 of the content, hex. Lets the UI notice the same file being added twice. */
  readonly fingerprint: string;
  /** Opened with a password the user typed. */
  readonly encrypted: boolean;
  /**
   * The `/P` value when the owner took something away (printing, copying...). Whatever is
   * exported from this file keeps those restrictions; they are never lifted (ADR 006).
   */
  readonly restrictions?: number;
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
  /** Text and pictures stamped on the pages of the output, in the order they are drawn. */
  readonly stamps: readonly Stamp[];
  readonly metadata: MetadataSettings;
  readonly bookmarks: BookmarkSettings;
  /** Crop and signatures, by page id. */
  readonly edits: EditsByPage;
  /** What was typed in the forms of the loaded files. */
  readonly forms: FormValues;
  readonly formMode: FormMode;
}

export const emptyWorkspace: Workspace = {
  sources: [],
  pages: [],
  selection: [],
  anchor: null,
  stamps: [],
  metadata: NO_METADATA,
  bookmarks: DEFAULT_BOOKMARKS,
  edits: {},
  forms: {},
  formMode: 'keep',
};

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
