# ADR 011: Thumbnail pipeline

- Status: Accepted
- Date: 2026-10-09
- Phase: 1

## Context

A 300-page document must show its first thumbnails in under a second, a 1000-page one must scroll at 60 fps, and memory must stay bounded. pdf.js lives in a worker (ADR 009).

## Decision

- **Render worker** keeps one pdf.js document open per source and renders a requested page to an `OffscreenCanvas`, returning a transferred `ImageBitmap`. Each request has an id, so the main thread can cancel it (`AbortController` in the worker, `RenderingCancelledException` from pdf.js).
- **`planRenders`** (in `core`, pure) decides what to cancel and what to start from four inputs: what is wanted now (most urgent first), what is running, what is cached and the concurrency limit (three). It is tested with properties: never over the limit, never starts what is cached or running.
- **`ThumbnailStore`** (web) runs that plan. It fills an LRU cache of 160 thumbnails (320 px wide, about 85 MB at most) that **closes each `ImageBitmap` it evicts**, so GPU memory is released. Components read one thumbnail each through `useSyncExternalStore`, keyed by `renderKey`, so a finished page repaints only itself. A page that fails is not retried in a loop; a late answer for a cancelled request is dropped and its bitmap closed.
- **What is wanted** is the visible rows plus two rows each side, ordered from the middle of the screen outward, recomputed on every scroll.
- **The export worker owns the source bytes** (registered once, validated on arrival); the render worker has its own copy that pdf.js owns. The main thread keeps no bytes after loading, so each file exists twice in memory, not three times. Measured in Phase 2 with 500 pages: see [ADR 015](015-benchmarks-and-memory.md). Loading now moves a freshly read copy of the file to each worker and lets pdf.js take it without another copy, which cut the memory peak of loading a 97 MB scan from 876 MB to 682 MB.

## Measured

First thumbnails of a 300-page PDF: 200 to 340 ms in Chromium and about 330 to 900 ms in WebKit on the development machine (budget: 1 s). Shared CI runners are slower and noisy (895 ms and 1054 ms in one run), so the E2E test enforces the budget locally and 3x on CI while always printing the real number.

## Alternatives considered

- **A render worker per document or a pool.** pdf.js already ran faster than the budget with one worker; add parallelism only if a measurement asks for it.
- **Rendering at several resolutions.** One width covers every thumbnail size from 120 to 280 px at 2x; the preview renders separately at 1600 px.

## Consequences

- Changing the thumbnail size needs no re-render.
- A document with thousands of pages keeps at most 160 bitmaps alive.
- The render worker runs pdf.js "fake worker" mode on its own thread, so parsing and drawing of different documents are serialised. Revisit if Phase 2's benchmark with many large files shows it.
