import { describe, expect, it } from 'vitest';
import { workspaceOf } from '../test-helpers';
import {
  clearSelection,
  selectAll,
  selectMany,
  selectOnly,
  selectRange,
  toggleSelection,
} from './selection';
import { emptyWorkspace, inDocumentOrder, withPages } from './workspace';

const ws = workspaceOf(6);

describe('selection', () => {
  it('selects one page and makes it the anchor', () => {
    const next = selectOnly(ws, 'p2');
    expect(next).toMatchObject({ selection: ['p2'], anchor: 'p2' });
  });

  it('ignores ids that are not in the workspace', () => {
    expect(selectOnly(ws, 'nope')).toBe(ws);
    expect(toggleSelection(ws, 'nope')).toBe(ws);
    expect(selectRange(ws, 'nope')).toBe(ws);
  });

  it('toggles pages in and out, always keeping document order', () => {
    let next = toggleSelection(selectOnly(ws, 'p4'), 'p1');
    expect(next.selection).toEqual(['p1', 'p4']);
    next = toggleSelection(next, 'p4');
    expect(next.selection).toEqual(['p1']);
  });

  it('selects the range between the anchor and the page, in either direction', () => {
    const base = selectOnly(ws, 'p3');
    expect(selectRange(base, 'p5').selection).toEqual(['p3', 'p4', 'p5']);
    expect(selectRange(base, 'p1').selection).toEqual(['p1', 'p2', 'p3']);
    expect(selectRange(base, 'p5').anchor).toBe('p3');
  });

  it('acts like a plain click when there is no anchor', () => {
    expect(selectRange(ws, 'p2').selection).toEqual(['p2']);
  });

  it('selects everything and clears it', () => {
    expect(selectAll(ws).selection).toHaveLength(6);
    expect(selectAll(emptyWorkspace).anchor).toBeNull();
    expect(clearSelection(selectAll(ws))).toMatchObject({ selection: [], anchor: null });
  });

  it('replaces or extends the selection for a rubber band', () => {
    const base = selectOnly(ws, 'p0');
    expect(selectMany(base, ['p3', 'p2'], false).selection).toEqual(['p2', 'p3']);
    expect(selectMany(base, ['p3'], true).selection).toEqual(['p0', 'p3']);
    expect(selectMany(base, [], false).anchor).toBeNull();
  });

  it('drops the anchor and selected ids that stop existing', () => {
    const base = selectOnly(ws, 'p5');
    const next = withPages(base, base.pages.slice(0, 3));
    expect(next).toMatchObject({ selection: [], anchor: null });
    expect(inDocumentOrder(base, ['p5', 'p0'])).toEqual(['p0', 'p5']);
  });
});
