# ADR 001: Monorepo structure

- Status: Accepted
- Date: 2026-10-09
- Phase: 0

## Context

Vidopdf is a browser PDF workspace whose value is in its domain logic (the workspace as a plan of page references, undoable commands, export plans), not in any single PDF library. That logic has to be testable without a browser and must survive a change of PDF engine. The UI changes more often and depends on the browser. SPEC.md fixes the three-way split: `core`, `pdf-adapters`, `apps/web`.

## Decision

A pnpm workspace with three packages, plus `tests/fixtures`, `tools` and `docs/adr`:

- `packages/core` (`@vidopdf/core`): pure TypeScript. No DOM lib, no React, no pdf.js or pdf-lib. Holds the domain model, commands, history, export plans and the ports (`PdfRenderer`, `PdfWriter`, `Compressor`, `FileIO`).
- `packages/pdf-adapters` (`@vidopdf/pdf-adapters`): implements the ports on top of `pdfjs-dist` and `@cantoo/pdf-lib`. Exposes one entry point per engine (`/pdfjs`, `/pdf-lib`) so a worker bundles only what it uses.
- `apps/web` (`@vidopdf/web`): React UI, Zustand state, i18n, and the Web Workers that call the adapters.

Packages are consumed from source (`exports` point at `.ts`), so there is no build step between them. Node and pnpm versions are pinned (`.nvmrc`, `packageManager`).

## Alternatives considered

- **One package with folders.** Simpler, but nothing stops domain code from importing pdf.js over time.
- **A package per feature (merge, split, compress...).** More isolation than a project of this size needs; the commands inside `core` already give that separation.
- **Publishing the packages to npm.** Not a goal. They stay `private`.

## Consequences

- The domain runs in Vitest in milliseconds and is covered by property tests.
- Swapping or adding a PDF engine (for the compression decision in Phase 3) only touches `pdf-adapters`.
- Each browser capability needs an adapter written on purpose. That cost is accepted.
