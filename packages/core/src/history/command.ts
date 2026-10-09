import { rotate } from '../workspace/page-ref';
import type { BlankPage, PageRef } from '../workspace/page-ref';
import { inDocumentOrder, withPages } from '../workspace/workspace';
import type { SourceFile, Workspace } from '../workspace/workspace';

export type CommandKind =
  | 'add'
  | 'remove'
  | 'restore'
  | 'move'
  | 'rotate'
  | 'duplicate'
  | 'insertBlank'
  | 'stamps'
  | 'metadata'
  | 'bookmarks'
  | 'crop'
  | 'signature'
  | 'forms';

/** What the history shows. The UI turns it into text; the core knows no language. */
export interface CommandLabel {
  readonly kind: CommandKind;
  /** Number of pages affected. */
  readonly count: number;
}

/**
 * A pure edit of the workspace. `invert` receives the workspace as it was *before* `apply` and
 * returns the command that undoes it. `merge` lets consecutive edits of the same kind collapse
 * into one history step.
 */
export interface Command {
  readonly label: CommandLabel;
  apply(workspace: Workspace): Workspace;
  invert(before: Workspace): Command;
  merge?(next: Command): Command | undefined;
}

export interface RotateCommand extends Command {
  readonly ids: readonly string[];
  readonly degrees: number;
}

export interface PageAt {
  readonly page: PageRef;
  /** Index the page has in the final list, once every entry is in place. */
  readonly index: number;
}

/** Inserts pages at their final indices. Entries must be sorted by ascending index. */
export function insertPages(
  entries: readonly PageAt[],
  label: CommandLabel,
  source?: SourceFile,
): Command {
  return {
    label,
    apply(workspace) {
      const pages = [...workspace.pages];
      for (const { page, index } of entries) pages.splice(Math.min(index, pages.length), 0, page);
      const sources =
        source === undefined || workspace.sources.some((s) => s.id === source.id)
          ? workspace.sources
          : [...workspace.sources, source];
      const ids = entries.map((entry) => entry.page.id);
      const next = withPages({ ...workspace, sources }, pages);
      return { ...next, selection: inDocumentOrder(next, ids), anchor: ids[0] ?? null };
    },
    invert() {
      return removePages(
        entries.map((entry) => entry.page.id),
        label,
      );
    },
  };
}

export function removePages(ids: readonly string[], label: CommandLabel): Command {
  const doomed = new Set(ids);
  return {
    label,
    apply(workspace) {
      return withPages(
        workspace,
        workspace.pages.filter((page) => !doomed.has(page.id)),
      );
    },
    invert(before) {
      const entries = before.pages
        .map((page, index) => ({ page, index }))
        .filter((entry) => doomed.has(entry.page.id));
      return insertPages(entries, { kind: 'restore', count: entries.length });
    },
  };
}

/** Sets the page order. Anything that is not a permutation of the current pages is ignored. */
export function reorderPages(order: readonly string[], label: CommandLabel): Command {
  return {
    label,
    apply(workspace) {
      const byId = new Map(workspace.pages.map((page) => [page.id, page]));
      const pages = order.map((id) => byId.get(id));
      const valid = order.length === byId.size && pages.every((page) => page !== undefined);
      return valid ? withPages(workspace, pages) : workspace;
    },
    invert(before) {
      return reorderPages(
        before.pages.map((page) => page.id),
        label,
      );
    },
  };
}

export function rotatePages(ids: readonly string[], degrees: number): RotateCommand {
  const targets = new Set(ids);
  const command: RotateCommand = {
    ids,
    degrees,
    label: { kind: 'rotate', count: ids.length },
    apply(workspace) {
      const pages = workspace.pages.map((page) =>
        targets.has(page.id) ? { ...page, rotation: rotate(page.rotation, degrees) } : page,
      );
      return { ...workspace, pages };
    },
    invert() {
      return rotatePages(ids, -degrees);
    },
    merge(next) {
      return isRotate(next) && sameIds(next.ids, ids)
        ? rotatePages(ids, degrees + next.degrees)
        : undefined;
    },
  };
  return command;
}

function isRotate(command: Command): command is RotateCommand {
  return command.label.kind === 'rotate' && 'degrees' in command;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Registers a file and appends all its pages. */
export function addSource(
  source: SourceFile,
  pages: readonly PageRef[],
): (workspace: Workspace) => Command {
  return (workspace) => {
    const start = workspace.pages.length;
    const entries = pages.map((page, offset) => ({ page, index: start + offset }));
    return insertPages(entries, { kind: 'add', count: pages.length }, source);
  };
}

/**
 * Moves pages so that, once they are lifted out, they land at `toIndex` of the remaining list.
 * They keep their relative document order.
 */
export function movePages(workspace: Workspace, ids: readonly string[], toIndex: number): Command {
  const moving = new Set(ids);
  const moved = workspace.pages.filter((page) => moving.has(page.id));
  const rest = workspace.pages.filter((page) => !moving.has(page.id));
  const at = Math.max(0, Math.min(toIndex, rest.length));
  const order = [...rest.slice(0, at), ...moved, ...rest.slice(at)].map((page) => page.id);
  return reorderPages(order, { kind: 'move', count: moved.length });
}

/**
 * Moves pages into a gap of the *current* list: gap 0 is before the first page, gap N after the
 * last. This is what a drop target knows, so the caller does not have to account for the pages
 * that leave their old place.
 */
export function movePagesToGap(workspace: Workspace, ids: readonly string[], gap: number): Command {
  const moving = new Set(ids);
  const leavingBefore = workspace.pages
    .slice(0, Math.max(0, gap))
    .filter((page) => moving.has(page.id)).length;
  return movePages(workspace, ids, gap - leavingBefore);
}

/** Puts a copy right after each given page. `newIds` are consumed in document order. */
export function duplicatePages(
  workspace: Workspace,
  ids: readonly string[],
  newIds: readonly string[],
): Command {
  const wanted = new Set(ids);
  const entries: PageAt[] = [];
  const copiedFrom = new Map<string, string>();
  let copies = 0;
  workspace.pages.forEach((page, index) => {
    const id = wanted.has(page.id) ? newIds[copies] : undefined;
    if (id === undefined) return;
    copies++;
    copiedFrom.set(id, page.id);
    entries.push({ page: { ...page, id }, index: index + copies });
  });
  const insert = insertPages(entries, { kind: 'duplicate', count: entries.length });
  return {
    ...insert,
    apply(current) {
      const next = insert.apply(current);
      // A copy of a cropped or signed page is cropped and signed too.
      const edits = { ...next.edits };
      for (const [copy, original] of copiedFrom) {
        const inherited = current.edits[original];
        if (inherited !== undefined) edits[copy] = inherited;
      }
      return { ...next, edits };
    },
  };
}

export function insertBlankPage(workspace: Workspace, page: BlankPage, index: number): Command {
  const at = Math.max(0, Math.min(index, workspace.pages.length));
  return insertPages([{ page, index: at }], { kind: 'insertBlank', count: 1 });
}

export function deletePages(ids: readonly string[]): Command {
  return removePages(ids, { kind: 'remove', count: ids.length });
}
