import { describe, expect, it } from 'vitest';
import { blank, ids, original, source, workspaceOf } from '../test-helpers';
import { emptyWorkspace } from '../workspace/workspace';
import { selectOnly } from '../workspace/selection';
import {
  addSource,
  deletePages,
  duplicatePages,
  insertBlankPage,
  insertPages,
  movePages,
  movePagesToGap,
  reorderPages,
  rotatePages,
} from './command';

describe('addSource', () => {
  it('registers the file and appends its pages, selecting them', () => {
    const pages = [original('a', 'f', 0), original('b', 'f', 1)];
    const command = addSource(source('f', 2), pages)(workspaceOf(2));
    const next = command.apply(workspaceOf(2));
    expect(ids(next)).toEqual(['p0', 'p1', 'a', 'b']);
    expect(next.sources.map((s) => s.id)).toEqual(['s1', 'f']);
    expect(next.selection).toEqual(['a', 'b']);
  });

  it('does not register the same source twice', () => {
    const ws = workspaceOf(1);
    const next = addSource(source('s1', 1), [original('x')])(ws).apply(ws);
    expect(next.sources).toHaveLength(1);
  });

  it('is undone by removing the pages it added', () => {
    const ws = workspaceOf(2);
    const command = addSource(source('f', 1), [original('a', 'f', 0)])(ws);
    const after = command.apply(ws);
    expect(ids(command.invert(ws).apply(after))).toEqual(['p0', 'p1']);
  });
});

describe('deletePages', () => {
  it('removes the pages and prunes the selection', () => {
    const ws = selectOnly(workspaceOf(4), 'p1');
    const next = deletePages(['p1', 'p2']).apply(ws);
    expect(ids(next)).toEqual(['p0', 'p3']);
    expect(next.selection).toEqual([]);
    expect(next.anchor).toBeNull();
  });

  it('is undone by restoring the pages at their old positions', () => {
    const ws = workspaceOf(5);
    const command = deletePages(['p1', 'p3']);
    const after = command.apply(ws);
    const restored = command.invert(ws).apply(after);
    expect(ids(restored)).toEqual(ids(ws));
    expect(restored.selection).toEqual(['p1', 'p3']);
  });
});

describe('movePages', () => {
  it('lifts the pages out and drops them at the index of the remaining list', () => {
    const ws = workspaceOf(5);
    expect(ids(movePages(ws, ['p0', 'p1'], 2).apply(ws))).toEqual(['p2', 'p3', 'p0', 'p1', 'p4']);
  });

  it('keeps the relative document order of the moved pages', () => {
    const ws = workspaceOf(4);
    expect(ids(movePages(ws, ['p3', 'p1'], 0).apply(ws))).toEqual(['p1', 'p3', 'p0', 'p2']);
  });

  it('clamps an out of range index', () => {
    const ws = workspaceOf(3);
    expect(ids(movePages(ws, ['p0'], 99).apply(ws))).toEqual(['p1', 'p2', 'p0']);
    expect(ids(movePages(ws, ['p2'], -5).apply(ws))).toEqual(['p2', 'p0', 'p1']);
  });

  it('is undone by restoring the previous order', () => {
    const ws = workspaceOf(5);
    const command = movePages(ws, ['p4'], 0);
    expect(ids(command.invert(ws).apply(command.apply(ws)))).toEqual(ids(ws));
  });
});

describe('movePagesToGap', () => {
  const ws = workspaceOf(6);

  it('drops pages into a gap of the current list, whatever leaves in front of it', () => {
    // Gap 4 sits between p3 and p4; p0 and p1 leave from before it, so they land after p3.
    expect(ids(movePagesToGap(ws, ['p0', 'p1'], 4).apply(ws))).toEqual([
      'p2',
      'p3',
      'p0',
      'p1',
      'p4',
      'p5',
    ]);
  });

  it('moves to the very start and the very end', () => {
    expect(ids(movePagesToGap(ws, ['p4'], 0).apply(ws))).toEqual([
      'p4',
      'p0',
      'p1',
      'p2',
      'p3',
      'p5',
    ]);
    expect(ids(movePagesToGap(ws, ['p1'], 6).apply(ws))).toEqual([
      'p0',
      'p2',
      'p3',
      'p4',
      'p5',
      'p1',
    ]);
  });

  it('leaves the order alone when dropped on its own gap', () => {
    expect(ids(movePagesToGap(ws, ['p2'], 2).apply(ws))).toEqual(ids(ws));
    expect(ids(movePagesToGap(ws, ['p2'], 3).apply(ws))).toEqual(ids(ws));
  });
});

describe('reorderPages', () => {
  it('ignores an order that is not a permutation of the pages', () => {
    const ws = workspaceOf(3);
    expect(reorderPages(['p0', 'p1'], { kind: 'move', count: 0 }).apply(ws)).toBe(ws);
    expect(reorderPages(['p0', 'p1', 'zzz'], { kind: 'move', count: 0 }).apply(ws)).toBe(ws);
  });
});

describe('rotatePages', () => {
  it('turns only the given pages and wraps around', () => {
    const ws = workspaceOf(3);
    const next = rotatePages(['p1'], 270).apply(rotatePages(['p1'], 180).apply(ws));
    expect(next.pages.map((p) => p.rotation)).toEqual([0, 90, 0]);
  });

  it('merges with another rotation of the same pages, in any order of ids', () => {
    const first = rotatePages(['a', 'b'], 90);
    const merged = first.merge?.(rotatePages(['b', 'a'], 90));
    expect(merged).toMatchObject({ degrees: 180 });
  });

  it('does not merge with a different selection or another kind of command', () => {
    const first = rotatePages(['a'], 90);
    expect(first.merge?.(rotatePages(['b'], 90))).toBeUndefined();
    expect(first.merge?.(rotatePages(['a', 'b'], 90))).toBeUndefined();
    expect(first.merge?.(deletePages(['a']))).toBeUndefined();
  });
});

describe('duplicatePages', () => {
  it('puts each copy right after its page, with a new id and the same rotation', () => {
    const ws = rotatePages(['p0'], 90).apply(workspaceOf(3));
    const command = duplicatePages(ws, ['p2', 'p0'], ['n1', 'n2']);
    const next = command.apply(ws);
    expect(ids(next)).toEqual(['p0', 'n1', 'p1', 'p2', 'n2']);
    expect(next.pages[1]).toMatchObject({ rotation: 90, sourceIndex: 0 });
    expect(next.selection).toEqual(['n1', 'n2']);
  });

  it('is undone by removing the copies', () => {
    const ws = workspaceOf(3);
    const command = duplicatePages(ws, ['p1'], ['n1']);
    expect(ids(command.invert(ws).apply(command.apply(ws)))).toEqual(ids(ws));
  });

  it('skips pages that have no id left to use', () => {
    const ws = workspaceOf(3);
    expect(ids(duplicatePages(ws, ['p0', 'p1'], ['n1']).apply(ws))).toEqual([
      'p0',
      'n1',
      'p1',
      'p2',
    ]);
  });
});

describe('insertBlankPage and insertPages', () => {
  it('inserts a blank page at the index, clamped to the ends', () => {
    const ws = workspaceOf(2);
    expect(ids(insertBlankPage(ws, blank('b'), 1).apply(ws))).toEqual(['p0', 'b', 'p1']);
    expect(ids(insertBlankPage(ws, blank('b'), 50).apply(ws))).toEqual(['p0', 'p1', 'b']);
  });

  it('appends when an entry points past the end', () => {
    const ws = workspaceOf(1);
    const next = insertPages([{ page: original('x'), index: 9 }], { kind: 'add', count: 1 }).apply(
      ws,
    );
    expect(ids(next)).toEqual(['p0', 'x']);
  });

  it('starts from an empty workspace', () => {
    const next = insertPages([{ page: original('x'), index: 0 }], { kind: 'add', count: 1 }).apply(
      emptyWorkspace,
    );
    expect(next.selection).toEqual(['x']);
  });
});
