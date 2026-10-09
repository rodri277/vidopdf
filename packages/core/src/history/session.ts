import type { Command, CommandLabel } from './command';
import type { Workspace } from '../workspace/workspace';

interface Entry {
  readonly command: Command;
  readonly inverse: Command;
  /** The workspace before the command ran. Cheap to keep: workspaces share structure. */
  readonly before: Workspace;
}

/** A persistent stack, so pushing and popping never copy the history. */
interface Stack {
  readonly entry: Entry;
  readonly rest: Stack | null;
  readonly size: number;
}

/** The workspace plus its unlimited undo and redo history, for the whole session. */
export interface Session {
  readonly workspace: Workspace;
  readonly past: Stack | null;
  readonly future: Stack | null;
}

export function createSession(workspace: Workspace): Session {
  return { workspace, past: null, future: null };
}

function push(stack: Stack | null, entry: Entry): Stack {
  return { entry, rest: stack, size: (stack?.size ?? 0) + 1 };
}

/** Runs a command. Merges into the previous step when the command allows it. */
export function execute(session: Session, command: Command): Session {
  const workspace = command.apply(session.workspace);
  const top = session.past;
  const merged = top?.entry.command.merge?.(command);
  if (top !== null && merged !== undefined) {
    const before = top.entry.before;
    const entry = { command: merged, inverse: merged.invert(before), before };
    return { workspace, past: { ...top, entry }, future: null };
  }
  const entry = { command, inverse: command.invert(session.workspace), before: session.workspace };
  return { workspace, past: push(session.past, entry), future: null };
}

export function undo(session: Session): Session {
  const top = session.past;
  if (top === null) return session;
  return {
    workspace: top.entry.inverse.apply(session.workspace),
    past: top.rest,
    future: push(session.future, top.entry),
  };
}

export function redo(session: Session): Session {
  const top = session.future;
  if (top === null) return session;
  return {
    workspace: top.entry.command.apply(session.workspace),
    past: push(session.past, top.entry),
    future: top.rest,
  };
}

/** Replaces the workspace without touching the history (selection changes are not undoable). */
export function withWorkspace(session: Session, workspace: Workspace): Session {
  return { ...session, workspace };
}

export function undoLabel(session: Session): CommandLabel | undefined {
  return session.past?.entry.command.label;
}

export function redoLabel(session: Session): CommandLabel | undefined {
  return session.future?.entry.command.label;
}

export function undoDepth(session: Session): number {
  return session.past?.size ?? 0;
}

export function redoDepth(session: Session): number {
  return session.future?.size ?? 0;
}
