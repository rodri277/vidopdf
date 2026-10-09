# Vidopdf

Browser-based PDF workspace: merge, split, reorder, rotate and compress PDFs without uploading them. By vidotho.

**Source of truth: [SPEC.md](SPEC.md).** If something conflicts with it or is missing, ask before improvising. Work one phase at a time, start each phase with a short plan (files, risks, order) and wait for Rodrigo's confirmation. A phase is done only when all its acceptance criteria pass, CI is green and docs are updated. Measure, do not assume.

## Commands

Node is pinned in `.nvmrc` (24.21.0): `fnm use`. dependency-cruiser refuses Node 25. pnpm comes from `packageManager`.

```bash
pnpm install          # frozen lockfile in CI
pnpm dev              # run the web app
pnpm lint             # ESLint (strict type-checked, complexity <= 10) + layer rules
pnpm format:check     # Prettier
pnpm typecheck        # tsc in every package
pnpm test             # core (90% coverage gate) + adapters + web + benchmark helpers + boundary tests
pnpm licenses:check   # license allow-list; `node tools/check-licenses.mjs --write` regenerates THIRD_PARTY_LICENSES.md
pnpm build            # production build of apps/web
pnpm size             # initial JS budget (150 kB gzip)
pnpm bench            # performance and memory benchmarks in headless Chromium; rewrites benchmarks/RESULTS.md (about 2 minutes; generates large documents on first run)
pnpm e2e              # Playwright + axe + privacy test on Chromium (builds and serves the production bundle)
pnpm e2e:webkit       # same on WebKit; `pnpm --filter @vidopdf/web exec playwright install webkit` once
```

`qpdf` must be installed locally (`brew install qpdf`): adapter tests run `qpdf --check` on every PDF we produce. It is a test tool only.

Before closing any task: lint, typecheck, test, and e2e if the UI changed. All green. `pnpm e2e` reuses a server already on port 4173 and would test a stale build: kill it first (`lsof -ti:4173 | xargs kill`).

`main` is protected: work on a branch, open a PR, wait for the `verify` check, squash-merge. Tags `vX.Y.0` mark the end of each phase; `node tools/changelog.mjs` rebuilds `CHANGELOG.md`.

## Architecture (ADR 001, 003)

- `packages/core`: pure TypeScript, no DOM, no React, no PDF libraries. Domain, commands, history, ports. Results are `Result<T, PdfError>` values, never thrown across a worker boundary.
- `packages/pdf-adapters`: implements the ports with `pdfjs-dist` and `@cantoo/pdf-lib`. One entry point per engine (`/pdfjs`, `/pdf-lib`).
- `apps/web`: React UI, i18next (Spanish default, English), and `src/workers/` (the only place that may import `pdf-adapters`). `state/session-store.ts` wires core commands and history to the UI; `thumbnails/` is the render queue and cache; `ui/grid-layout.ts` and `ui/keys.ts` are pure and tested.
- `apps/web/src/workers/*-core.ts` hold the logic of both workers and are tested with fakes; the `*.worker.ts` files only wire Comlink. `state/session-store.ts` is a factory (`createSessionStore(deps)`) tested with fake workers.
- Anything that touches pdf.js inside a worker needs a real browser to be trusted: the Node tests cannot see problems like a missing `document` (ADR 009). Add an E2E for it.
- Memory matters here (ADR 015): do not keep copies of a file's bytes in the main thread, trim pdf.js caches when drawing many pages in a row, and re-run `pnpm bench` after touching loading, rendering or export.
- Every user action goes through `ui/actions.ts`, which also announces it to screen readers. Add new ones there, with a command, an inverse and a property test in `core` (ADR 010).
- The original PDFs are never modified. The workspace is a plan of page references; the output PDF is built at export time.
- Rules are enforced by `.dependency-cruiser.cjs` and proven by `tools/check-boundaries.test.mjs`.

## Conventions

- Code, commits and ADRs in English. UI and README in Spanish and English; every new string goes in both `i18n/es.ts` and `i18n/en.ts`.
- Conventional Commits, one intention per commit (commitlint runs in the hook).
- No `any`, no `@ts-ignore`, no default exports (except config files).
- New dependency: check its license (MIT, Apache-2.0, BSD, ISC, CC0; OFL for fonts) and bundle weight, then regenerate `THIRD_PARTY_LICENSES.md`. Decisions go in `docs/adr/`.
- Privacy is a feature: no analytics, no third-party requests, no external fonts or scripts. The CSP lives in `vercel.json` and the E2E privacy test must stay green.
- Fixtures: only code-generated or public-domain/CC0 PDFs, provenance noted in `tests/fixtures/README.md`.
- Never describe the product as removing protections or unlocking PDFs (SPEC, "Cumplimiento legal").
