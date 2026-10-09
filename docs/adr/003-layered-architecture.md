# ADR 003: Layered architecture and enforced dependency rules

- Status: Accepted
- Date: 2026-10-09
- Phase: 0

## Context

SPEC.md asks for ports and adapters: a domain core that knows nobody, adapters that implement its ports, and a UI that never touches PDF libraries. Rules that are only written down erode; they need to fail the build.

## Decision

Dependency rules live in `.dependency-cruiser.cjs` and run in CI (`pnpm deps:check`):

1. `core-imports-nothing-outside-itself`: `packages/core/src` imports only itself.
2. `adapters-only-import-core-and-pdf-libs`: `pdf-adapters` imports `core`, `pdfjs-dist` and `@cantoo/pdf-lib`.
3. `ui-never-imports-pdf-libs`: nothing under `apps/web/src` imports `pdfjs-dist` or `pdf-lib`.
4. `pdf-work-only-in-workers`: only `apps/web/src/workers` may import `pdf-adapters`, so rendering and export cannot run on the main thread by accident.
5. `no-circular`.

`tools/check-boundaries.test.mjs` runs dependency-cruiser against small fixture trees in `tools/fixtures/` and asserts that every rule fails on its violation and that a valid tree passes. That is the "prohibited import breaks CI" proof the Phase 0 criteria ask for, and it stays in the suite instead of living in a one-off commit.

Other lint rules: strict type-checked ESLint, no `any`, no `@ts-ignore`, cyclomatic complexity at most 10.

Errors cross the worker boundary as values (`Result<T, PdfError>`), never as exceptions.

## Alternatives considered

- **Convention only, reviewed by hand.** Does not scale and cannot be shown to a reviewer as evidence.
- **ESLint `no-restricted-imports`.** Cannot express circularity or per-folder layer rules as clearly.

## Consequences

- A violation fails `pnpm lint` locally (pre-commit) and in CI.
- The rules have to be revisited when `ocr` joins the workers (Phase 5).
- dependency-cruiser supports Node 22, 24 and 26 only, which is one more reason `.nvmrc` pins Node 24 (see ADR 008).
