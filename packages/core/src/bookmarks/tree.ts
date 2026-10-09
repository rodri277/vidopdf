import type { OutlineEntry } from '../ports';
import type { PageRef } from '../workspace/page-ref';

/** A bookmark of the output. `pageId` is a page of the workspace, so it follows the page around. */
export interface BookmarkNode {
  readonly id: string;
  readonly title: string;
  /** The page it opens, or null for a heading that opens its first child. */
  readonly pageId: string | null;
  readonly children: readonly BookmarkNode[];
}

/**
 * `auto` keeps the bookmarks of the loaded files (merging used to lose them), `custom` uses the
 * tree the user edited, `none` writes no bookmarks.
 */
export type BookmarkMode = 'auto' | 'custom' | 'none';

export interface BookmarkSettings {
  readonly mode: BookmarkMode;
  /** The tree of `custom`; `auto` is built from the files when exporting. */
  readonly nodes: readonly BookmarkNode[];
}

export const DEFAULT_BOOKMARKS: BookmarkSettings = { mode: 'auto', nodes: [] };

export const MAX_TITLE_LENGTH = 300;

/** The bookmarks of one file, as the viewer reports them (flat, with a level), as a tree. */
export interface SourceOutline {
  readonly sourceId: string;
  readonly entries: readonly OutlineEntry[];
}

function firstPageOf(pages: readonly PageRef[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const page of pages) {
    if (page.kind !== 'original') continue;
    const key = `${page.sourceId}:${String(page.sourceIndex)}`;
    if (!first.has(key)) first.set(key, page.id);
  }
  return first;
}

/**
 * Builds the tree of the bookmarks of every loaded file, one after the other, pointing at the
 * first page of the workspace that shows each target. Targets that are not in the workspace
 * (deleted pages) get `null`.
 */
export function fromOutlines(
  outlines: readonly SourceOutline[],
  pages: readonly PageRef[],
  newId: () => string,
): BookmarkNode[] {
  const target = firstPageOf(pages);
  const roots: Mutable[] = [];
  for (const { sourceId, entries } of outlines) {
    // `path` holds the open ancestors: each is rebuilt with its children when the next sibling starts.
    const stack: { level: number; node: Mutable }[] = [];
    for (const entry of entries) {
      const node: Mutable = {
        id: newId(),
        title: entry.title.slice(0, MAX_TITLE_LENGTH),
        pageId: target.get(`${sourceId}:${String(entry.pageIndex)}`) ?? null,
        children: [],
      };
      while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= entry.level) stack.pop();
      const parent = stack.at(-1)?.node;
      (parent === undefined ? roots : parent.children).push(node);
      stack.push({ level: entry.level, node });
    }
  }
  return roots.map(freeze);
}

interface Mutable {
  id: string;
  title: string;
  pageId: string | null;
  children: Mutable[];
}

function freeze(node: Mutable): BookmarkNode {
  return { ...node, children: node.children.map(freeze) };
}

export interface ResolvedBookmark {
  readonly title: string;
  /** Zero-based position in the output. */
  readonly pageIndex: number;
  readonly children: readonly ResolvedBookmark[];
}

/**
 * The bookmarks as they will be written for an output made of `pageIds` (in order). A bookmark
 * whose page is not in the output disappears and its children move up a level; a heading takes
 * the page of its first child; a heading with nothing under it disappears.
 */
export function resolveBookmarks(
  nodes: readonly BookmarkNode[],
  pageIds: readonly string[],
): ResolvedBookmark[] {
  const index = new Map(pageIds.map((id, position) => [id, position]));
  const resolve = (list: readonly BookmarkNode[]): ResolvedBookmark[] =>
    list.flatMap((node) => {
      const children = resolve(node.children);
      const own = node.pageId === null ? undefined : index.get(node.pageId);
      if (own !== undefined) return [{ title: node.title, pageIndex: own, children }];
      const heading = node.pageId === null ? children[0]?.pageIndex : undefined;
      return heading === undefined
        ? children
        : [{ title: node.title, pageIndex: heading, children }];
    });
  return resolve(nodes);
}

export function countBookmarks(nodes: readonly BookmarkNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countBookmarks(node.children), 0);
}

/** Every node with how deep it is, in reading order: what the editor lists. */
export function flattenBookmarks(
  nodes: readonly BookmarkNode[],
  depth = 0,
): { node: BookmarkNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenBookmarks(node.children, depth + 1)]);
}

export function findBookmark(nodes: readonly BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inside = findBookmark(node.children, id);
    if (inside !== undefined) return inside;
  }
  return undefined;
}

function mapTree(
  nodes: readonly BookmarkNode[],
  change: (node: BookmarkNode) => BookmarkNode | undefined,
): BookmarkNode[] {
  return nodes.flatMap((node) => {
    const changed = change(node);
    return changed === undefined
      ? []
      : [{ ...changed, children: mapTree(changed.children, change) }];
  });
}

export function updateBookmark(
  nodes: readonly BookmarkNode[],
  id: string,
  patch: Partial<Pick<BookmarkNode, 'title' | 'pageId'>>,
): BookmarkNode[] {
  const title = patch.title === undefined ? {} : { title: patch.title.slice(0, MAX_TITLE_LENGTH) };
  return mapTree(nodes, (node) => (node.id === id ? { ...node, ...patch, ...title } : node));
}

export function removeBookmark(nodes: readonly BookmarkNode[], id: string): BookmarkNode[] {
  return mapTree(nodes, (node) => (node.id === id ? undefined : node));
}

/** Adds `node` under `parentId` (null for the top level) at `index` (the end by default). */
export function addBookmark(
  nodes: readonly BookmarkNode[],
  parentId: string | null,
  node: BookmarkNode,
  index?: number,
): BookmarkNode[] {
  const insert = (list: readonly BookmarkNode[]): BookmarkNode[] => {
    const at = Math.max(0, Math.min(index ?? list.length, list.length));
    return [...list.slice(0, at), node, ...list.slice(at)];
  };
  if (parentId === null) return insert(nodes);
  return mapTree(nodes, (candidate) =>
    candidate.id === parentId ? { ...candidate, children: insert(candidate.children) } : candidate,
  );
}

/** Moves a node under another one (or to the top level). A node cannot go inside itself. */
export function moveBookmark(
  nodes: readonly BookmarkNode[],
  id: string,
  parentId: string | null,
  index?: number,
): BookmarkNode[] {
  const moving = findBookmark(nodes, id);
  if (moving === undefined) return [...nodes];
  if (parentId !== null && findBookmark([moving], parentId) !== undefined) return [...nodes];
  return addBookmark(removeBookmark(nodes, id), parentId, moving, index);
}

function locate(
  nodes: readonly BookmarkNode[],
  id: string,
  parent: BookmarkNode | null = null,
): { parent: BookmarkNode | null; siblings: readonly BookmarkNode[]; index: number } | undefined {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) return { parent, siblings: nodes, index };
  for (const node of nodes) {
    const inside = locate(node.children, id, node);
    if (inside !== undefined) return inside;
  }
  return undefined;
}

/** Makes a node the last child of the sibling before it (one level deeper). */
export function indentBookmark(nodes: readonly BookmarkNode[], id: string): BookmarkNode[] {
  const spot = locate(nodes, id);
  const before = spot === undefined ? undefined : spot.siblings[spot.index - 1];
  return before === undefined ? [...nodes] : moveBookmark(nodes, id, before.id);
}

/** Makes a node a sibling right after its parent (one level up). */
export function outdentBookmark(nodes: readonly BookmarkNode[], id: string): BookmarkNode[] {
  const parentId = locate(nodes, id)?.parent?.id;
  const above = parentId === undefined ? undefined : locate(nodes, parentId);
  if (above === undefined) return [...nodes];
  return moveBookmark(nodes, id, above.parent?.id ?? null, above.index + 1);
}
