import { describe, expect, it } from 'vitest';
import { interpretGridKey, interpretShortcut } from './keys';
import type { KeyLike } from './keys';

const key = (name: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: name,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});
const context = { columns: 4, rowsPerScreen: 3 };

describe('interpretGridKey', () => {
  it('moves the active page and selects it', () => {
    expect(interpretGridKey(key('ArrowRight'), context)).toEqual({
      type: 'go',
      to: 1,
      mode: 'select',
    });
    expect(interpretGridKey(key('ArrowDown'), context)).toEqual({
      type: 'go',
      to: 4,
      mode: 'select',
    });
    expect(interpretGridKey(key('PageDown'), context)).toEqual({
      type: 'go',
      to: 12,
      mode: 'select',
    });
  });

  it('extends the selection with Shift and only moves the cursor with Ctrl or Cmd', () => {
    expect(interpretGridKey(key('ArrowLeft', { shiftKey: true }), context)).toMatchObject({
      mode: 'extend',
    });
    expect(interpretGridKey(key('ArrowLeft', { ctrlKey: true }), context)).toMatchObject({
      mode: 'move',
    });
    expect(interpretGridKey(key('ArrowLeft', { metaKey: true }), context)).toMatchObject({
      mode: 'move',
    });
  });

  it('reorders with Alt and the arrows, and Alt + Home or End', () => {
    expect(interpretGridKey(key('ArrowLeft', { altKey: true }), context)).toEqual({
      type: 'nudge',
      delta: -1,
    });
    expect(interpretGridKey(key('ArrowUp', { altKey: true }), context)).toEqual({
      type: 'nudge',
      delta: -4,
    });
    expect(interpretGridKey(key('Home', { altKey: true }), context)).toEqual({
      type: 'edge',
      edge: 'start',
    });
    expect(interpretGridKey(key('End', { altKey: true }), context)).toEqual({
      type: 'edge',
      edge: 'end',
    });
    expect(interpretGridKey(key('x', { altKey: true }), context)).toBeUndefined();
  });

  it('jumps to the first and last page', () => {
    expect(interpretGridKey(key('Home'), context)).toEqual({
      type: 'go',
      to: 'first',
      mode: 'select',
    });
    expect(interpretGridKey(key('End', { shiftKey: true }), context)).toEqual({
      type: 'go',
      to: 'last',
      mode: 'extend',
    });
  });

  it('opens the preview with Space or Enter and deletes with Delete or Backspace', () => {
    expect(interpretGridKey(key(' '), context)).toEqual({ type: 'preview' });
    expect(interpretGridKey(key('Enter'), context)).toEqual({ type: 'preview' });
    expect(interpretGridKey(key('Delete'), context)).toEqual({ type: 'delete' });
    expect(interpretGridKey(key('Backspace'), context)).toEqual({ type: 'delete' });
    expect(interpretGridKey(key('Backspace', { metaKey: true }), context)).toBeUndefined();
  });

  it('ignores other keys and copes with a one-column grid', () => {
    expect(interpretGridKey(key('q'), context)).toBeUndefined();
    expect(interpretGridKey(key('ArrowDown'), { columns: 1, rowsPerScreen: 0 })).toMatchObject({
      to: 1,
    });
  });
});

describe('interpretShortcut', () => {
  it.each([
    [key('z', { metaKey: true }), 'undo'],
    [key('z', { ctrlKey: true }), 'undo'],
    [key('Z', { ctrlKey: true, shiftKey: true }), 'redo'],
    [key('y', { ctrlKey: true }), 'redo'],
    [key('a', { metaKey: true }), 'selectAll'],
    [key('d', { ctrlKey: true }), 'duplicate'],
    [key('o', { ctrlKey: true }), 'addFiles'],
    [key('e', { metaKey: true }), 'export'],
    [key('r'), 'rotateRight'],
    [key('R', { shiftKey: true }), 'rotateLeft'],
  ] as const)('maps %o to %s', (event, intent) => {
    expect(interpretShortcut(event, false)).toBe(intent);
  });

  it('only treats Delete as a page shortcut when nothing else has focus', () => {
    expect(interpretShortcut(key('Delete'), true)).toBe('delete');
    expect(interpretShortcut(key('Delete'), false)).toBeUndefined();
  });

  it('does not treat Alt combinations or unknown keys as shortcuts', () => {
    expect(interpretShortcut(key('r', { altKey: true }), false)).toBeUndefined();
    expect(interpretShortcut(key('q', { ctrlKey: true }), false)).toBeUndefined();
  });
});
