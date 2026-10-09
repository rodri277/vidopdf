/** Pure translation of key presses into intents, so the rules can be tested without a browser. */
export interface KeyLike {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export type GridIntent =
  | { readonly type: 'nudge'; readonly delta: number }
  | { readonly type: 'edge'; readonly edge: 'start' | 'end' }
  | {
      readonly type: 'go';
      readonly to: number | 'first' | 'last';
      readonly mode: 'select' | 'extend' | 'move';
    }
  | { readonly type: 'preview' }
  | { readonly type: 'delete' };

export interface GridContext {
  readonly columns: number;
  /** Rows that fit on screen, for PageUp and PageDown. */
  readonly rowsPerScreen: number;
}

const isModifier = (event: KeyLike) => event.ctrlKey || event.metaKey;

function stepFor(key: string, { columns, rowsPerScreen }: GridContext): number | undefined {
  const page = columns * Math.max(1, rowsPerScreen);
  const steps: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns,
    PageUp: -page,
    PageDown: page,
  };
  return steps[key];
}

function altIntent(event: KeyLike, step: number | undefined): GridIntent | undefined {
  if (step !== undefined) return { type: 'nudge', delta: step };
  if (event.key === 'Home') return { type: 'edge', edge: 'start' };
  if (event.key === 'End') return { type: 'edge', edge: 'end' };
  return undefined;
}

function modeOf(event: KeyLike): 'select' | 'extend' | 'move' {
  if (isModifier(event)) return 'move';
  return event.shiftKey ? 'extend' : 'select';
}

function jumpIntent(event: KeyLike): GridIntent | undefined {
  if (event.key !== 'Home' && event.key !== 'End') return undefined;
  return {
    type: 'go',
    to: event.key === 'Home' ? 'first' : 'last',
    mode: event.shiftKey ? 'extend' : 'select',
  };
}

function actionIntent(event: KeyLike): GridIntent | undefined {
  if (event.key === ' ' || event.key === 'Enter') return { type: 'preview' };
  const deleting = event.key === 'Delete' || event.key === 'Backspace';
  return deleting && !isModifier(event) ? { type: 'delete' } : undefined;
}

/** Keys that act while the page grid has the keyboard (Alt + arrows reorders; see SPEC). */
export function interpretGridKey(event: KeyLike, context: GridContext): GridIntent | undefined {
  const step = stepFor(event.key, context);
  if (event.altKey && !isModifier(event)) return altIntent(event, step);
  if (step !== undefined) return { type: 'go', to: step, mode: modeOf(event) };
  return jumpIntent(event) ?? actionIntent(event);
}

export type ShortcutIntent =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'duplicate'
  | 'addFiles'
  | 'export'
  | 'rotateRight'
  | 'rotateLeft'
  | 'delete';

const MODIFIED: Record<string, ShortcutIntent> = {
  z: 'undo',
  y: 'redo',
  a: 'selectAll',
  d: 'duplicate',
  o: 'addFiles',
  e: 'export',
};

/** SPEC "Atajos de teclado": the shortcuts that work wherever the focus is on the page. */
export function interpretShortcut(event: KeyLike, onBody: boolean): ShortcutIntent | undefined {
  const key = event.key.toLowerCase();
  if (isModifier(event)) {
    if (key === 'z' && event.shiftKey) return 'redo';
    return MODIFIED[key];
  }
  if (event.altKey) return undefined;
  if (key === 'r') return event.shiftKey ? 'rotateLeft' : 'rotateRight';
  // The grid handles these itself when it has focus; this covers focus elsewhere on the page.
  if ((event.key === 'Delete' || event.key === 'Backspace') && onBody) return 'delete';
  return undefined;
}
