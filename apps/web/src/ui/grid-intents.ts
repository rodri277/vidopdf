import { deleteSelection, moveSelectionToEdge, nudgeSelection } from './actions';
import type { GridIntent } from './keys';

export interface GridEnv {
  readonly activeIndex: number;
  readonly pageCount: number;
  readonly goTo: (index: number, mode: 'select' | 'extend' | 'move') => void;
  readonly preview: () => void;
}

function targetIndex(to: number | 'first' | 'last', env: GridEnv): number {
  if (to === 'first') return 0;
  if (to === 'last') return env.pageCount - 1;
  return env.activeIndex + to;
}

/** Carries out what a key press in the grid means. */
export function runGridIntent(intent: GridIntent, env: GridEnv): void {
  switch (intent.type) {
    case 'nudge':
      nudgeSelection(intent.delta);
      break;
    case 'edge':
      moveSelectionToEdge(intent.edge);
      break;
    case 'delete':
      deleteSelection();
      break;
    case 'preview':
      env.preview();
      break;
    case 'go':
      env.goTo(targetIndex(intent.to, env), intent.mode);
      break;
  }
}
