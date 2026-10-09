# Vidopdf

[Leer en español](README.es.md)

A PDF workspace that runs 100% in your browser. Load one or several PDFs, see every page as a thumbnail, and merge, split, reorder, rotate, compress and protect them. **Your files never leave your device**: no backend, no analytics, no third-party requests, enforced by a strict Content Security Policy and an end-to-end test.

> **Status: Phase 1 done (v0.2.0).** Load several PDFs, see every page as a thumbnail, select, drag or nudge pages into a new order, rotate, duplicate, delete, insert blank pages, preview, undo and redo without limit, and export one PDF. Splitting, compression, images and the rest arrive phase by phase; see [SPEC.md](SPEC.md).

## Keyboard

| Action                        | Shortcut                                 |
| ----------------------------- | ---------------------------------------- |
| Undo, redo                    | Ctrl or Cmd + Z, Ctrl or Cmd + Shift + Z |
| Select all                    | Ctrl or Cmd + A                          |
| Rotate right, left            | R, Shift + R                             |
| Delete pages                  | Delete or Backspace                      |
| Duplicate                     | Ctrl or Cmd + D                          |
| Preview                       | Space or Enter (double click also works) |
| Add files, export             | Ctrl or Cmd + O, Ctrl or Cmd + E         |
| Move the selection            | Alt + arrows, Alt + Home or End          |
| Move around, extend selection | Arrows, Shift + arrows                   |

## Run it

Requires Node 24 (`fnm use`), pnpm 12 and, for the tests, `qpdf`.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit, property, PDF integration and architecture-rule tests
pnpm e2e          # Playwright: privacy, accessibility, hostile files (Chromium)
pnpm build        # production bundle in apps/web/dist
```

## How it is built

Ports and adapters: a DOM-free `core`, adapters over `pdfjs-dist` and `@cantoo/pdf-lib`, and a React app whose heavy work runs in Web Workers. The layer rules fail the build when broken ([ADR 003](docs/adr/003-layered-architecture.md)). All decisions are in [docs/adr](docs/adr/README.md).

## Measured so far

2026-10-09, version 0.2.0, Apple-silicon laptop, headless browsers.

| Metric                                              | Value                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| First thumbnails of a 300-page PDF                  | 200 to 340 ms in Chromium, 330 to 900 ms in WebKit (budget 1 s)                           |
| Initial JavaScript                                  | 111.7 kB gzip (budget 150 kB)                                                             |
| `packages/core` coverage                            | 100 % lines, gate 90 %                                                                    |
| Tests                                               | 65 core, 32 adapters, 57 web, 9 architecture rules, 32 E2E in each of Chromium and WebKit |
| Lighthouse, memory with 500 pages, 1000-page scroll | not measured yet (Phases 2 and 3)                                                         |

## Known limitations

- Encrypted PDFs, including those with only owner restrictions, are rejected in this version.
- **Merging uses pdf-lib's `copyPages`, which loses some structure** (pinned by `merge-limits.test.ts`):
  - bookmarks (the outline) are dropped;
  - form fields stop being fillable: the widgets stay visible but the form definition is gone;
  - tagging (`/MarkInfo`, `/StructTreeRoot`) and the document language are dropped, so the output is less accessible to screen readers.
- External links and the text layer survive, and pictures are copied byte for byte (they are not recompressed in this version).

## How this was made with AI

Vidopdf is built with Claude Code from a written specification ([SPEC.md](SPEC.md)). Claude Code writes code, tests and ADRs one phase at a time; Rodrigo reviews each plan before it starts, and reviews the result. This section records what was asked, generated, reviewed and corrected, and is updated at the end of each phase.

**Phase 0.** Claude Code set up the monorepo, the layer rules and their proof tests, the CI, the strict CSP and the two spikes (pdf.js in a worker, merging with pdf-lib). Corrections made along the way, found by running things rather than assuming: pdf.js 6 no longer has `isEvalSupported`; pdf.js reads `document` in places that break inside a worker (ADR 009); a native `<select>` makes WebKit log a spurious CSP warning, so the language switch is a button group.

**Phase 1.** Claude Code proposed the plan in six blocks and Rodrigo approved it, delegating the open choices ("whatever is best for the user and for development"). Each block was a pull request that had to pass CI before merging. Choices Claude made on its own, so they can be reviewed: the workspace as immutable page references edited by commands ([ADR 010](docs/adr/010-workspace-as-a-plan-of-commands.md)); a pure planner for thumbnail renders ([ADR 011](docs/adr/011-thumbnail-pipeline.md)); virtualizing the grid with arithmetic instead of `@tanstack/react-virtual`, and keyboard reordering with Alt + arrows instead of dnd-kit's keyboard sensor ([ADR 012](docs/adr/012-grid-virtualization-and-reordering.md)). Found by running, not by thinking: pdf.js progress callbacks can arrive after the result (a race that left the export stuck), the first draft of the layer rules missed workspace package names, and a comparison tolerance of 0.1 % of pixels was too loose to notice a changed text label, so it is 0.01 %. What was _not_ done: the real-world public-domain PDF samples SPEC mentions; code-generated fixtures stand in for them.

## License

MIT. Third-party notices: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
