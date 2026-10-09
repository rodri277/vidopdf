import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blank, ids, workspaceOf } from '../test-helpers';
import type { Command } from './command';
import { deletePages, duplicatePages, insertBlankPage, movePages, rotatePages } from './command';
import {
  createSession,
  execute,
  redo,
  redoDepth,
  redoLabel,
  undo,
  undoDepth,
  undoLabel,
  withWorkspace,
} from './session';
import type { Session } from './session';
import { selectOnly } from '../workspace/selection';

describe('session', () => {
  it('undoes and redoes a command', () => {
    const start = createSession(workspaceOf(3));
    const done = execute(start, deletePages(['p1']));
    expect(ids(done.workspace)).toEqual(['p0', 'p2']);
    expect(ids(undo(done).workspace)).toEqual(['p0', 'p1', 'p2']);
    expect(ids(redo(undo(done)).workspace)).toEqual(['p0', 'p2']);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const start = createSession(workspaceOf(2));
    expect(undo(start)).toBe(start);
    expect(redo(start)).toBe(start);
  });

  it('drops the redo history when a new command runs', () => {
    const start = createSession(workspaceOf(3));
    const afterUndo = undo(execute(start, deletePages(['p0'])));
    expect(redoDepth(afterUndo)).toBe(1);
    expect(redoDepth(execute(afterUndo, deletePages(['p1'])))).toBe(0);
  });

  it('reports depth and the label of the next undo and redo', () => {
    let session = createSession(workspaceOf(3));
    expect(undoLabel(session)).toBeUndefined();
    session = execute(session, deletePages(['p0', 'p1']));
    expect(undoLabel(session)).toEqual({ kind: 'remove', count: 2 });
    expect(undoDepth(session)).toBe(1);
    session = undo(session);
    expect(redoLabel(session)).toEqual({ kind: 'remove', count: 2 });
  });

  it('merges consecutive rotations of the same pages into one step', () => {
    let session = createSession(workspaceOf(3));
    session = execute(session, rotatePages(['p0'], 90));
    session = execute(session, rotatePages(['p0'], 90));
    session = execute(session, rotatePages(['p0'], 90));
    expect(undoDepth(session)).toBe(1);
    expect(session.workspace.pages[0]?.rotation).toBe(270);
    expect(undo(session).workspace.pages[0]?.rotation).toBe(0);
    expect(redo(undo(session)).workspace.pages[0]?.rotation).toBe(270);
  });

  it('keeps rotations of different pages as separate steps', () => {
    let session = createSession(workspaceOf(3));
    session = execute(session, rotatePages(['p0'], 90));
    session = execute(session, rotatePages(['p1'], 90));
    expect(undoDepth(session)).toBe(2);
  });

  it('does not make selection changes part of the history', () => {
    const start = createSession(workspaceOf(3));
    const selected = withWorkspace(start, selectOnly(start.workspace, 'p2'));
    expect(undoDepth(selected)).toBe(0);
    expect(selected.workspace.selection).toEqual(['p2']);
  });
});

/** Builds one of the editing commands from five integers, using whatever the workspace holds now. */
function commandFor(session: Session, step: number, a: number, b: number, c: number): Command {
  const { workspace } = session;
  const all = ids(workspace);
  const pick = all.filter((_, i) => (a >> (i % 20)) % 2 === 1 || i === a % Math.max(all.length, 1));
  const chosen = pick.length > 0 ? pick : all.slice(0, 1);
  const fresh = (n: number) => `n${String(step)}-${String(n)}`;
  switch ((a + b) % 5) {
    case 0:
      return movePages(workspace, chosen, b % (all.length + 1));
    case 1:
      return rotatePages(chosen, 90 * ((c % 3) + 1));
    case 2:
      return deletePages(chosen);
    case 3:
      return duplicatePages(
        workspace,
        chosen,
        chosen.map((_, i) => fresh(i)),
      );
    default:
      return insertBlankPage(workspace, blank(fresh(0)), b % (all.length + 1));
  }
}

const steps = fc.array(fc.tuple(fc.nat(1000), fc.nat(1000), fc.nat(1000)), {
  minLength: 1,
  maxLength: 25,
});

describe('history properties', () => {
  it('a command followed by its inverse restores the pages', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), steps, (size, plan) => {
        let session = createSession(workspaceOf(size));
        plan.forEach(([a, b, c], step) => {
          const command = commandFor(session, step, a, b, c);
          const before = session.workspace;
          const after = command.apply(before);
          expect(command.invert(before).apply(after).pages).toEqual(before.pages);
          session = withWorkspace(session, after);
        });
      }),
    );
  });

  it('undoing every step returns to the start, and redoing returns to the end', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), steps, (size, plan) => {
        const start = createSession(workspaceOf(size));
        let session = start;
        plan.forEach(([a, b, c], step) => {
          session = execute(session, commandFor(session, step, a, b, c));
        });
        const end = session.workspace.pages;
        while (undoDepth(session) > 0) session = undo(session);
        expect(session.workspace.pages).toEqual(start.workspace.pages);
        while (redoDepth(session) > 0) session = redo(session);
        expect(session.workspace.pages).toEqual(end);
      }),
    );
  });

  it('never loses or invents pages that were not touched by the command', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 12 }), fc.nat(1000), fc.nat(1000), (size, a, b) => {
        const ws = workspaceOf(size);
        const next = movePages(ws, ids(ws).slice(0, (a % size) + 1), b).apply(ws);
        expect([...ids(next)].sort()).toEqual([...ids(ws)].sort());
      }),
    );
  });

  it('keeps page ids unique through any sequence of edits', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), steps, (size, plan) => {
        let session = createSession(workspaceOf(size));
        plan.forEach(([a, b, c], step) => {
          session = execute(session, commandFor(session, step, a, b, c));
        });
        const all = ids(session.workspace);
        expect(new Set(all).size).toBe(all.length);
      }),
    );
  });
});
