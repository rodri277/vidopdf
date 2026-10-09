import type { Margins } from '../pages/crop';
import { isCrop, normalizeCrop } from '../pages/crop';
import type { EditsByPage, Overlay, PageEdits } from '../pages/edits';
import { isEmptyEdits } from '../pages/edits';
import type { Workspace } from '../workspace/workspace';
import type { Command, CommandKind } from './command';

/** The parts of the workspace that settings change, besides the page list. */
type Fields = Pick<Workspace, 'stamps' | 'metadata' | 'bookmarks' | 'forms' | 'formMode'>;
export type Patch = Partial<Fields>;

export interface FieldCommand extends Command {
  /** Changes with the same key collapse into one step of the history (typing in a field). */
  readonly mergeKey: string | undefined;
  readonly patch: Patch;
}

function isFieldCommand(command: Command): command is FieldCommand {
  return 'patch' in command;
}

/**
 * Replaces some settings of the workspace. Undoing puts back what was there before; consecutive
 * changes with the same `mergeKey` become one history step, so typing a title is one undo.
 */
export function setFields(kind: CommandKind, patch: Patch, mergeKey?: string): FieldCommand {
  return {
    label: { kind, count: 1 },
    mergeKey,
    patch,
    apply: (workspace) => ({ ...workspace, ...patch }),
    invert(before) {
      const restore: Patch = {};
      for (const key of Object.keys(patch) as (keyof Fields)[])
        Object.assign(restore, { [key]: before[key] });
      return setFields(kind, restore, mergeKey);
    },
    merge(next) {
      const same =
        mergeKey !== undefined &&
        isFieldCommand(next) &&
        next.mergeKey === mergeKey &&
        next.label.kind === kind;
      return same ? setFields(kind, { ...patch, ...next.patch }, mergeKey) : undefined;
    },
  };
}

/** The new edits of some pages; `undefined` means the page has none any more. */
type EditChanges = Readonly<Record<string, PageEdits | undefined>>;

export interface EditsCommand extends Command {
  readonly mergeKey: string | undefined;
  readonly after: EditChanges;
}

function isEditsCommand(command: Command): command is EditsCommand {
  return 'after' in command;
}

function withEdits(edits: EditsByPage, changes: EditChanges): EditsByPage {
  const next = new Map(Object.entries(edits));
  for (const [id, value] of Object.entries(changes)) {
    if (value === undefined || isEmptyEdits(value)) next.delete(id);
    else next.set(id, value);
  }
  return Object.fromEntries(next);
}

/** Sets the exact edits of some pages. Undoing sets back what each had. */
export function replaceEdits(
  kind: CommandKind,
  after: EditChanges,
  mergeKey?: string,
): EditsCommand {
  return {
    label: { kind, count: Object.keys(after).length },
    mergeKey,
    after,
    apply: (workspace) => ({ ...workspace, edits: withEdits(workspace.edits, after) }),
    invert(before) {
      const restore: Record<string, PageEdits | undefined> = {};
      for (const id of Object.keys(after)) restore[id] = before.edits[id];
      return replaceEdits(kind, restore, mergeKey);
    },
    merge(next) {
      const same =
        mergeKey !== undefined &&
        isEditsCommand(next) &&
        next.mergeKey === mergeKey &&
        next.label.kind === kind;
      return same ? replaceEdits(kind, { ...after, ...next.after }, mergeKey) : undefined;
    },
  };
}

function changed(
  workspace: Workspace,
  ids: readonly string[],
  change: (edits: PageEdits) => PageEdits,
): EditChanges {
  const known = new Set(workspace.pages.map((page) => page.id));
  const out: Record<string, PageEdits | undefined> = {};
  for (const id of ids) if (known.has(id)) out[id] = change(workspace.edits[id] ?? {});
  return out;
}

/** Crops pages (as the reader sees them); `undefined` or no margins removes the crop. */
export function cropPages(
  workspace: Workspace,
  ids: readonly string[],
  margins: Margins | undefined,
  mergeKey?: string,
): EditsCommand {
  const crop = margins === undefined || !isCrop(margins) ? undefined : normalizeCrop(margins);
  return replaceEdits(
    'crop',
    changed(workspace, ids, (edits) => {
      const rest = { ...edits };
      delete rest.crop;
      return crop === undefined ? rest : { ...rest, crop };
    }),
    mergeKey,
  );
}

/** Puts a picture (a signature) on a page, or moves or resizes one that is already there. */
export function placeOverlay(
  workspace: Workspace,
  pageId: string,
  overlay: Overlay,
  mergeKey?: string,
): EditsCommand {
  return replaceEdits(
    'signature',
    changed(workspace, [pageId], (edits) => {
      const others = (edits.overlays ?? []).filter((candidate) => candidate.id !== overlay.id);
      return { ...edits, overlays: [...others, overlay] };
    }),
    mergeKey,
  );
}

export function removeOverlay(
  workspace: Workspace,
  pageId: string,
  overlayId: string,
): EditsCommand {
  return replaceEdits(
    'signature',
    changed(workspace, [pageId], (edits) => ({
      ...edits,
      overlays: (edits.overlays ?? []).filter((candidate) => candidate.id !== overlayId),
    })),
  );
}
