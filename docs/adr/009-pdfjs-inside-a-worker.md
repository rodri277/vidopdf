# ADR 009: pdf.js inside a Web Worker

- Status: Accepted
- Date: 2026-10-09
- Phase: 0

## Context

SPEC rule 4: rendering, export and OCR run only in workers. pdfjs-dist is designed for the main thread, and the Phase 0 spike found where that assumption leaks (pdfjs-dist 6.4.299):

- `getDocument` computes `useWorkerFetch` from `document.baseURI`, and `fetchData` reads it too; both throw `ReferenceError: document is not defined` in a worker.
- The font loader uses `document.fonts`.
- The old `isEvalSupported` option no longer exists: version 6 has no eval path, and embedded scripts only run in the separate `quickjs-eval` sandbox, which we do not serve.

## Decision

The renderer (`packages/pdf-adapters/src/pdfjs-renderer.ts`) is created inside `render.worker.ts` and passes `useWorkerFetch: true` (an explicit boolean skips the `document` lookups, and the data files are fetched with `fetch`), `disableFontFace: true` (glyphs are drawn as paths instead of through FontFace) and `maxImageSize` equal to our canvas budget. It draws into an `OffscreenCanvas` whose area is capped at 4096 x 4096 pixels (`pickScale`) and returns an `ImageBitmap` that is transferred, not copied.

pdf.js logs "Setting up fake worker": inside our worker it runs its own worker code on the same thread instead of spawning a nested one. That is acceptable, because the work is already off the main thread, and it is covered by the E2E tests in Chromium and WebKit. Whether a nested worker is worth it (parsing and rendering in parallel) is a Phase 1/2 measurement.

All pdf.js data (`cmaps/`, `standard_fonts/`, `iccs/`, `wasm/`, `pdf.worker.min.mjs`) is served from `/pdfjs/` on our own origin, so the CSP can stay at `default-src 'self'`. `'wasm-unsafe-eval'` is in `script-src` because pdf.js decodes JPEG 2000 and JBIG2 with WASM.

## Alternatives considered

- **Render on the main thread.** Simple, breaks the SPEC rule and blocks the UI on large pages.
- **Polyfill a fake `document` in the worker.** Fragile; it hides the next DOM access instead of avoiding it.

## Consequences

- PDFs without embedded fonts fall back to the system sans-serif font (see ADR 005).
- Upgrading pdfjs-dist needs the E2E render test to pass again; the options above are the likely points of breakage.
