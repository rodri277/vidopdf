import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOKMARKS } from '../bookmarks/tree';
import { NO_METADATA } from '../document/metadata';
import { presets } from '../stamps/stamp';
import { workspaceOf } from '../test-helpers';
import { duplicatePages } from './command';
import { cropPages, placeOverlay, removeOverlay, replaceEdits, setFields } from './field-commands';
import { createSession, execute, redo, undo } from './session';

const overlay = { id: 'o1', assetId: 'sig', x: 0.1, y: 0.8, width: 0.3, aspect: 0.4 };

describe('setFields', () => {
  it('changes settings and undoing puts back exactly what was there', () => {
    const session = createSession(workspaceOf(2));
    const stamped = execute(session, setFields('stamps', { stamps: [presets.pageNumber('a')] }));
    expect(stamped.workspace.stamps).toHaveLength(1);
    expect(undo(stamped).workspace.stamps).toEqual([]);
    expect(redo(undo(stamped)).workspace.stamps).toHaveLength(1);
  });

  it('typing in a field is one step of the history, and one undo takes it all back', () => {
    let session = createSession(workspaceOf(1));
    for (const title of ['R', 'Re', 'Rep', 'Report']) {
      session = execute(
        session,
        setFields('metadata', { metadata: { ...NO_METADATA, title } }, 'title'),
      );
    }
    expect(session.workspace.metadata.title).toBe('Report');
    const undone = undo(session);
    expect(undone.workspace.metadata).toEqual(NO_METADATA);
    expect(undone.past).toBeNull();
    expect(redo(undone).workspace.metadata.title).toBe('Report');
  });

  it('changes of different fields, or without a key, stay separate steps', () => {
    let session = createSession(workspaceOf(1));
    session = execute(
      session,
      setFields('metadata', { metadata: { ...NO_METADATA, title: 'a' } }, 'title'),
    );
    session = execute(
      session,
      setFields('metadata', { metadata: { ...NO_METADATA, author: 'b' } }, 'author'),
    );
    session = execute(
      session,
      setFields('bookmarks', { bookmarks: { ...DEFAULT_BOOKMARKS, mode: 'none' } }),
    );
    session = execute(session, setFields('bookmarks', { bookmarks: DEFAULT_BOOKMARKS }));
    expect(session.past?.size).toBe(4);
  });
});

describe('edits of a page', () => {
  const ws = workspaceOf(3);

  it('crops, and a crop that removes nothing removes the edits', () => {
    const cropped = execute(
      createSession(ws),
      cropPages(ws, ['p0'], { top: 0.1, right: 0, bottom: 0, left: 0.05 }),
    );
    expect(cropped.workspace.edits.p0?.crop).toEqual({
      top: 0.1,
      right: 0,
      bottom: 0,
      left: 0.05,
    });
    const cleared = execute(cropped, cropPages(cropped.workspace, ['p0'], undefined));
    expect(cleared.workspace.edits).toEqual({});
    expect(undo(cleared).workspace.edits.p0?.crop?.top).toBe(0.1);
  });

  it('ignores pages that are not in the workspace, and fixes a crop that leaves nothing', () => {
    const none = cropPages(ws, ['ghost'], { top: 0.2, right: 0, bottom: 0, left: 0 });
    expect(none.apply(ws).edits).toEqual({});
    const huge = cropPages(ws, ['p1'], { top: 0.8, right: 0, bottom: 0.8, left: 0 }).apply(ws);
    const crop = huge.edits.p1?.crop;
    expect((crop?.top ?? 0) + (crop?.bottom ?? 0)).toBeCloseTo(0.9, 6);
  });

  it('dragging a crop handle is one step of the history', () => {
    let session = createSession(ws);
    for (const top of [0.05, 0.1, 0.15]) {
      session = execute(
        session,
        cropPages(session.workspace, ['p0'], { top, right: 0, bottom: 0, left: 0 }, 'drag'),
      );
    }
    expect(session.past?.size).toBe(1);
    expect(session.workspace.edits.p0?.crop?.top).toBe(0.15);
    expect(undo(session).workspace.edits).toEqual({});
  });

  it('places a signature, moves it, and removes it', () => {
    const placed = execute(createSession(ws), placeOverlay(ws, 'p1', overlay));
    expect(placed.workspace.edits.p1?.overlays).toEqual([overlay]);
    const moved = execute(placed, placeOverlay(placed.workspace, 'p1', { ...overlay, x: 0.5 }));
    expect(moved.workspace.edits.p1?.overlays).toEqual([{ ...overlay, x: 0.5 }]);
    const removed = execute(moved, removeOverlay(moved.workspace, 'p1', 'o1'));
    expect(removed.workspace.edits).toEqual({});
    expect(undo(removed).workspace.edits.p1?.overlays).toHaveLength(1);
  });

  it('a copy of a cropped page is cropped too, and removing the copy leaves the original alone', () => {
    const cropped = execute(
      createSession(ws),
      cropPages(ws, ['p0'], { top: 0.1, right: 0, bottom: 0, left: 0 }),
    );
    const copied = execute(cropped, duplicatePages(cropped.workspace, ['p0'], ['copy']));
    expect(copied.workspace.pages.map((p) => p.id)).toEqual(['p0', 'copy', 'p1', 'p2']);
    expect(copied.workspace.edits.copy?.crop).toEqual(copied.workspace.edits.p0?.crop);
    expect(undo(copied).workspace.pages).toHaveLength(3);
    expect(undo(copied).workspace.edits.p0?.crop?.top).toBe(0.1);
  });

  it('replaceEdits with different keys does not merge', () => {
    const a = replaceEdits(
      'crop',
      { p0: { crop: { top: 0.1, right: 0, bottom: 0, left: 0 } } },
      'a',
    );
    const b = replaceEdits(
      'crop',
      { p0: { crop: { top: 0.2, right: 0, bottom: 0, left: 0 } } },
      'b',
    );
    expect(a.merge?.(b)).toBeUndefined();
  });
});
