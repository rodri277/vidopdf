# Vidopdf

[Leer en español](README.es.md) · **[Live demo](https://vidopdf-web.vercel.app)**

A PDF workspace that runs 100% in your browser. Load one or several PDFs, see every page as a thumbnail, and merge, split, reorder, rotate, compress and protect them. **Your files never leave your device**: no backend, no analytics, no third-party requests, enforced by a strict Content Security Policy and an end-to-end test.

> **Status: Phase 2 done (v0.3.0).** On top of the page workspace: split a document four ways (by ranges, every N pages, by bookmarks, by maximum size) into a ZIP, extract pages, turn JPEG and PNG pictures into pages, and turn pages into PNG, JPEG or WebP pictures. Compression, the in-app legal pages and the public release arrive in Phase 3; see [SPEC.md](SPEC.md).

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

2026-10-09, version 0.3.0, Apple M4 laptop, headless Chromium (and WebKit for the E2E). Reproduce with `pnpm bench`; the full table with every number is in [benchmarks/RESULTS.md](benchmarks/RESULTS.md).

| Metric                                             | Budget (SPEC)                 | Measured                                                                                                          |
| -------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Scroll of a 1000-page document                     | 60 fps, no task over 50 ms    | 60 fps, no frame over 20 ms, no long task (also with the main thread 4x slower)                                   |
| Reorder, rotate or delete 1 to 1000 pages          | under 100 ms                  | about 31 ms painted (the work itself takes 0.1 to 1.8 ms)                                                         |
| Merge 20 files and 500 pages                       | no blocking, progress visible | 1.5 s, 29 to 33 progress steps, no long task                                                                      |
| First thumbnails of a 1000-page document           | 1 s for 300 pages             | 0.3 to 0.4 s                                                                                                      |
| Memory, 500 text pages / 500 scanned pages (97 MB) | measured and documented       | 0.5 GB / 1.1 GB, peak 1.3 GB exporting ([ADR 015](docs/adr/015-benchmarks-and-memory.md))                         |
| Warning for too much loaded PDF                    | adjusted with data            | 150 MB (was 250 MB)                                                                                               |
| Initial JavaScript                                 | 150 kB gzip                   | 105.6 kB                                                                                                          |
| `packages/core` coverage                           | 90 % lines                    | 99.5 %                                                                                                            |
| Tests                                              |                               | 162 core, 101 adapters, 136 web, 9 architecture rules, 9 benchmark helpers, 70 E2E in each of Chromium and WebKit |
| Lighthouse                                         | 95 to 100                     | not measured yet (Phase 3)                                                                                        |

## Known limitations

- Encrypted PDFs, including those with only owner restrictions, are rejected in this version.
- **Merging uses pdf-lib's `copyPages`, which loses some structure** (pinned by `merge-limits.test.ts`):
  - bookmarks (the outline) are dropped;
  - form fields stop being fillable: the widgets stay visible but the form definition is gone;
  - tagging (`/MarkInfo`, `/StructTreeRoot`) and the document language are dropped, so the output is less accessible to screen readers.
- **Split by bookmarks** uses the bookmarks of the original files, because merging drops them; a page that is the target of a bookmark starts a new file.
- **Split by maximum size** builds the real PDFs to measure them, so it takes seconds on big documents (5.4 s for 500 pages); a page that is over the limit on its own cannot be split and the dialog names it.
- **Pictures in:** only JPEG and PNG (WebP and GIF are turned down). Mirrored EXIF orientations (2, 4, 5, 7) follow the standard table but were not checked against camera files.
- **Pictures out:** WebP depends on the browser (Safari on macOS cannot write it, and the option is switched off with an explanation). Pages too large for the canvas budget are drawn at a lower resolution and you are told. A ZIP is built in memory.
- **Memory:** about 6.5 MB of browser memory per MB of scanned PDF; the application warns at 150 MB loaded.
- External links and the text layer survive, and pictures are copied byte for byte (they are not recompressed in this version).

## How this was made with AI

Vidopdf is built with Claude Code from a written specification ([SPEC.md](SPEC.md)). Claude Code writes code, tests and ADRs one phase at a time; Rodrigo reviews each plan before it starts, and reviews the result. This section records what was asked, generated, reviewed and corrected, and is updated at the end of each phase.

**Phase 0.** Claude Code set up the monorepo, the layer rules and their proof tests, the CI, the strict CSP and the two spikes (pdf.js in a worker, merging with pdf-lib). Corrections made along the way, found by running things rather than assuming: pdf.js 6 no longer has `isEvalSupported`; pdf.js reads `document` in places that break inside a worker (ADR 009); a native `<select>` makes WebKit log a spurious CSP warning, so the language switch is a button group.

**Phase 1.** Claude Code proposed the plan in six blocks and Rodrigo approved it, delegating the open choices ("whatever is best for the user and for development"). Each block was a pull request that had to pass CI before merging. Choices Claude made on its own, so they can be reviewed: the workspace as immutable page references edited by commands ([ADR 010](docs/adr/010-workspace-as-a-plan-of-commands.md)); a pure planner for thumbnail renders ([ADR 011](docs/adr/011-thumbnail-pipeline.md)); virtualizing the grid with arithmetic instead of `@tanstack/react-virtual`, and keyboard reordering with Alt + arrows instead of dnd-kit's keyboard sensor ([ADR 012](docs/adr/012-grid-virtualization-and-reordering.md)). Found by running, not by thinking: pdf.js progress callbacks can arrive after the result (a race that left the export stuck), the first draft of the layer rules missed workspace package names, and a comparison tolerance of 0.1 % of pixels was too loose to notice a changed text label, so it is 0.01 %. What was _not_ done: the real-world public-domain PDF samples SPEC mentions; code-generated fixtures stand in for them.

**Phase 2.** Same loop: plan first, approval, then five blocks as pull requests (pure logic in `core`, adapters, workers and state, interface, benchmarks), each merged only with CI green. Rodrigo delegated the open choices again. Taken by Claude and recorded for review: splitting works on the workspace and not on the files ([ADR 013](docs/adr/013-splitting.md)); pictures become one-page PDF sources on import and are drawn on white paper with the grid's rotation on export ([ADR 014](docs/adr/014-pictures-in-and-out.md)); the memory warning moved from 250 to 150 MB with the measurements as the reason ([ADR 015](docs/adr/015-benchmarks-and-memory.md)). **Found by measuring or by a real browser, not by thinking:** scanned PDFs did not show thumbnails (pdf.js needed a canvas it cannot create in a worker; only a big enough scan triggers it), exporting 500 scanned pages as pictures used 4.8 GB (now 1.4 GB), loading kept extra copies of the file, and the image-format check asked a canvas with no context, so every format looked unsupported and the panel looped. **Not done, or not verified:** the real-world public-domain PDFs of SPEC (code-generated fixtures stand in), memory in Safari and Firefox, and a measurement on a real mid-range laptop (the 4x column is only a proxy).

## License

MIT. Third-party notices: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
