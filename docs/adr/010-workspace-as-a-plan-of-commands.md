# ADR 010: The workspace is a plan, edited by commands

- Status: Accepted
- Date: 2026-10-09
- Phase: 1

## Context

SPEC says the original PDFs are never modified: the workspace is a plan of page references and the output PDF is built only on export. The editor must undo and redo everything in the session without a limit, stay under 100 ms for reordering, rotating or deleting pages, and keep selection and thumbnails stable while pages move.

## Decision

All of it lives in `packages/core`, with no browser and no PDF library:

- **`PageRef`** is either an original page (source id, zero-based index in that file, rotation) or a blank page (size, rotation). Every one has a stable `id`. A duplicate gets a new id but the same `renderKey`, so it shares the thumbnail of the page it copies; rotation is applied when drawing, never by re-rendering.
- **`Workspace`** is immutable: sources, the ordered page list, the selection (kept in document order) and the anchor for Shift-click ranges. A command returns a new workspace and nothing else changes.
- **`Command`** has `apply`, `invert(before)` and a structured label (`kind` and `count`; the UI translates it). The primitives are `insertPages`, `removePages`, `reorderPages` and `rotatePages`; adding a file, moving, duplicating and deleting are built from them. Moving takes a _gap of the current list_ (`movePagesToGap`), because that is what a drop target knows.
- **History** (`Session`) keeps the past and the future as persistent linked stacks, so pushing and popping copies nothing and the depth is unlimited. Each entry stores the command, its inverse and the workspace before it ran (cheap: workspaces share structure). Consecutive rotations of the same pages merge into one step, as SPEC asks.
- **Selection is not history.** Clicking changes the workspace without creating an undo step. Undoing a deletion selects the restored pages.
- **Export** is a plan of steps (`assemble` for now), built from the workspace. Compression, stamping and protection will be more steps.

Properties checked with fast-check: a command followed by its inverse restores the pages; undoing every step of a random session returns to the start and redoing all of them returns to the end; ids stay unique; moving never loses or invents a page. `packages/core` has 100 % line coverage and the CI gate is 90 %.

## Alternatives considered

- **Snapshot history** (store every workspace, undo by swapping). Trivially correct but it would make `invert` meaningless, and the SPEC asks for commands with inverses.
- **A mutable page list with an operation log.** Cheaper per edit, but shares nothing, and structural sharing is what makes keeping `before` free.
- **An external undo library.** One more dependency for roughly eighty lines.

## Consequences

- Reordering, rotating and deleting are array operations on at most a few thousand references; there is no PDF work until export.
- Blank pages exist only in the plan (A4, 595 x 842 pt) until the writer creates them.
- Every new feature that edits pages has to be expressed as a command with an inverse and a property test.
