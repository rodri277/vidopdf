# Vidopdf

[Leer en español](README.es.md)

A PDF workspace that runs 100% in your browser. Load one or several PDFs, see every page as a thumbnail, and merge, split, reorder, rotate, compress and protect them. **Your files never leave your device**: no backend, no analytics, no third-party requests, enforced by a strict Content Security Policy and an end-to-end test.

> **Status: Phase 0 (foundations).** The app currently loads PDFs, shows the first page of each, and merges them on export. The workspace grid, undo/redo and the rest arrive phase by phase; see [SPEC.md](SPEC.md).

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

| Metric                        | Value                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Initial JavaScript            | see `pnpm size` (budget 150 kB gzip)                                |
| `packages/core` line coverage | enforced at 90% in CI                                               |
| E2E                           | Chromium and WebKit, including axe and the no-foreign-requests test |

Numbers are added here, with date and version, when each phase closes.

## Known limitations

- Encrypted PDFs, including those with only owner restrictions, are rejected in this version.
- Phase 0 renders the first page only and offers no page editing yet.

## How this was made with AI

Vidopdf is built with Claude Code from a written specification ([SPEC.md](SPEC.md)). Claude Code writes code, tests and ADRs one phase at a time; Rodrigo reviews each plan before it starts, and reviews the result. This section records what was asked, generated, reviewed and corrected, and is updated at the end of each phase.

**Phase 0.** Claude Code set up the monorepo, the layer rules and their proof tests, the CI, the strict CSP and the two spikes (pdf.js in a worker, merging with pdf-lib). Corrections made along the way, found by running things rather than assuming: pdf.js 6 no longer has `isEvalSupported`; pdf.js reads `document` in places that break inside a worker (ADR 009); a native `<select>` makes WebKit log a spurious CSP warning, so the language switch is a button group.

## License

MIT. Third-party notices: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
