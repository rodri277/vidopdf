import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { original } from '../test-helpers';
import {
  addBookmark,
  countBookmarks,
  findBookmark,
  flattenBookmarks,
  fromOutlines,
  indentBookmark,
  moveBookmark,
  outdentBookmark,
  removeBookmark,
  resolveBookmarks,
  updateBookmark,
} from './tree';
import type { BookmarkNode } from './tree';

const node = (id: string, pageId: string | null, children: BookmarkNode[] = []): BookmarkNode => ({
  id,
  title: `T-${id}`,
  pageId,
  children,
});

const ids = (nodes: readonly BookmarkNode[]): string[] =>
  flattenBookmarks(nodes).map((e) => e.node.id);

describe('fromOutlines', () => {
  const pages = [original('a0', 's1', 0), original('a1', 's1', 1), original('b0', 's2', 0)];
  let counter = 0;
  const newId = () => `n${String(++counter)}`;

  it('builds the tree from flat entries with levels, source after source', () => {
    counter = 0;
    const tree = fromOutlines(
      [
        {
          sourceId: 's1',
          entries: [
            { title: 'One', pageIndex: 0, level: 1 },
            { title: 'One.a', pageIndex: 1, level: 2 },
            { title: 'Two', pageIndex: 1, level: 1 },
          ],
        },
        { sourceId: 's2', entries: [{ title: 'B', pageIndex: 0, level: 1 }] },
      ],
      pages,
      newId,
    );
    expect(tree.map((n) => [n.title, n.pageId, n.children.map((c) => c.title)])).toEqual([
      ['One', 'a0', ['One.a']],
      ['Two', 'a1', []],
      ['B', 'b0', []],
    ]);
  });

  it('points at null when no page of the workspace shows the target', () => {
    counter = 0;
    const [only] = fromOutlines(
      [{ sourceId: 's1', entries: [{ title: 'Gone', pageIndex: 9, level: 1 }] }],
      pages,
      newId,
    );
    expect(only?.pageId).toBeNull();
  });

  it('copes with a level that jumps (1 then 3) by nesting under the last open node', () => {
    counter = 0;
    const tree = fromOutlines(
      [
        {
          sourceId: 's1',
          entries: [
            { title: 'A', pageIndex: 0, level: 1 },
            { title: 'C', pageIndex: 1, level: 3 },
          ],
        },
      ],
      pages,
      newId,
    );
    expect(tree[0]?.children.map((c) => c.title)).toEqual(['C']);
  });
});

describe('resolveBookmarks', () => {
  it('writes the position each page has in the output', () => {
    const tree = [node('x', 'p2', [node('y', 'p0')])];
    expect(resolveBookmarks(tree, ['p0', 'p1', 'p2'])).toEqual([
      { title: 'T-x', pageIndex: 2, children: [{ title: 'T-y', pageIndex: 0, children: [] }] },
    ]);
  });

  it('drops a bookmark whose page is not in the output and moves its children up', () => {
    const tree = [node('x', 'gone', [node('y', 'p1')])];
    expect(resolveBookmarks(tree, ['p0', 'p1']).map((b) => [b.title, b.pageIndex])).toEqual([
      ['T-y', 1],
    ]);
  });

  it('a heading takes the page of its first child, and disappears when it has none', () => {
    const tree = [node('h', null, [node('c', 'p1')]), node('empty', null)];
    expect(resolveBookmarks(tree, ['p0', 'p1']).map((b) => [b.title, b.pageIndex])).toEqual([
      ['T-h', 1],
    ]);
  });

  it('every resolved page index is inside the output', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('p0', 'p1', 'p2', 'zz', null), { maxLength: 8 }),
        (targets) => {
          const tree = targets.map((pageId, i) => node(`n${String(i)}`, pageId));
          const out = ['p0', 'p1', 'p2'];
          const walk = (
            list: readonly { pageIndex: number; children: readonly unknown[] }[],
          ): boolean =>
            list.every(
              (b) => b.pageIndex >= 0 && b.pageIndex < out.length && walk(b.children as never),
            );
          expect(walk(resolveBookmarks(tree, out))).toBe(true);
        },
      ),
    );
  });
});

describe('editing the tree', () => {
  const tree = [node('a', 'p0', [node('a1', 'p1')]), node('b', 'p2')];

  it('adds, renames, retargets and removes by id, without touching the original', () => {
    const added = addBookmark(tree, 'a', node('a2', 'p2'), 0);
    expect(ids(added)).toEqual(['a', 'a2', 'a1', 'b']);
    expect(ids(tree)).toEqual(['a', 'a1', 'b']);
    expect(
      findBookmark(updateBookmark(tree, 'b', { title: 'x'.repeat(999), pageId: 'p0' }), 'b'),
    ).toMatchObject({ pageId: 'p0' });
    expect(
      findBookmark(updateBookmark(tree, 'b', { title: 'x'.repeat(999) }), 'b')?.title,
    ).toHaveLength(300);
    expect(ids(removeBookmark(tree, 'a'))).toEqual(['b']);
    expect(ids(addBookmark(tree, null, node('z', null), 1))).toEqual(['a', 'a1', 'z', 'b']);
  });

  it('moves a node under another and refuses to put it inside itself', () => {
    expect(ids(moveBookmark(tree, 'b', 'a', 0))).toEqual(['a', 'b', 'a1']);
    expect(ids(moveBookmark(tree, 'a', 'a1'))).toEqual(['a', 'a1', 'b']);
    expect(ids(moveBookmark(tree, 'nope', null))).toEqual(['a', 'a1', 'b']);
  });

  it('indents under the sibling before it and outdents after its parent', () => {
    const indented = indentBookmark(tree, 'b');
    expect(flattenBookmarks(indented).map((e) => [e.node.id, e.depth])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['b', 1],
    ]);
    expect(
      flattenBookmarks(outdentBookmark(indented, 'b')).map((e) => [e.node.id, e.depth]),
    ).toEqual([
      ['a', 0],
      ['a1', 1],
      ['b', 0],
    ]);
    // The first node has no sibling before it, a top-level node has no parent: nothing changes.
    expect(ids(indentBookmark(tree, 'a'))).toEqual(ids(tree));
    expect(ids(outdentBookmark(tree, 'a'))).toEqual(ids(tree));
    expect(ids(indentBookmark(tree, 'missing'))).toEqual(ids(tree));
    expect(ids(outdentBookmark(tree, 'missing'))).toEqual(ids(tree));
  });

  it('moving keeps every node exactly once, whatever is moved where', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('a', 'a1', 'b'),
        fc.constantFrom('a', 'a1', 'b', null),
        fc.nat(3),
        (id, parent, at) => {
          const moved = moveBookmark(tree, id, parent, at);
          expect([...ids(moved)].sort()).toEqual(['a', 'a1', 'b']);
          expect(countBookmarks(moved)).toBe(3);
        },
      ),
    );
  });
});
