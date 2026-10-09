# ADR 012: Grid virtualization, selection and reordering

- Status: Accepted
- Date: 2026-10-09
- Phase: 1

## Context

SPEC asks for a virtualized grid (`@tanstack/react-virtual`), selection with click, Shift, Ctrl or Cmd and a rubber band, drag and drop with mouse and keyboard through `dnd-kit`, an insertion indicator, and accessibility (ARIA listbox, announcements, keyboard-only operation).

## Decision

- **Every cell has the same size**, and the grid is centred. That makes the position of any page plain arithmetic: `grid-layout.ts` computes the visible range, the cells under a rectangle (rubber band) and the nearest gap to a point (drop target) with no DOM measurement. They are pure functions with property tests. This is a deliberate deviation from the SPEC stack: **`@tanstack/react-virtual` is not used**, because it virtualizes by measuring, and drop targets and rubber bands would still need this arithmetic for the cells that are not mounted. One fewer dependency, one source of truth for geometry.
- **Pointer dragging uses `@dnd-kit/core`** (`DndContext`, `useDraggable`, `DragOverlay`, `PointerSensor` with an 8 px threshold, built-in auto-scroll). Where the page would land is not dnd-kit's collision detection but `gapAt`, fed by the real pointer position and recomputed on scroll, so it also works for pages that are not mounted. Dragging a page that is not selected selects it; dragging a selected page moves the whole selection, keeping its internal order.
- **Keyboard reordering is Alt + arrows** (one page, or a row with up and down), Alt + Home and End. dnd-kit's keyboard sensor is not used: it needs element rectangles of the items, which a virtualized grid does not have, and Space is the preview key in SPEC. Every move is announced ("página 3 movida a la posición 7") in a polite live region, and so is every other action.
- **Focus is virtual**: the listbox holds the keyboard focus and points at the active option with `aria-activedescendant`; options carry `aria-posinset` and `aria-setsize` because most of them are not in the DOM. Arrow keys move the active page and select it, Shift extends, Ctrl or Cmd moves without selecting, Space or Enter opens the preview. Key bindings are pure functions (`keys.ts`) with unit tests.
- **Rotation is CSS**: the thumbnail canvas is turned with a transform, using container-query units so a sideways page fits its frame; nothing is redrawn.

## Alternatives considered

- **`@dnd-kit/sortable`.** Built for lists whose items are all mounted; with virtualization it cannot compute positions for the rest.
- **Variable-height cells that follow each page's aspect ratio.** Prettier on mixed sizes, but it breaks the arithmetic above. A fixed cell with the page fitted inside it is the usual compromise of page sorters.
- **Roving tabindex.** Each card would be a tab stop, and a card that scrolls out of the DOM would lose focus.

## Consequences

- Any number of pages costs the same: about thirty cards are in the DOM whatever the size of the document (E2E checks that 305 pages keep fewer than 60).
- Changing the cell shape means changing `grid-layout.ts` and its tests, and nothing else.
- Touch dragging is not tuned yet (SPEC: tablet is usable, mobile is not a priority).
