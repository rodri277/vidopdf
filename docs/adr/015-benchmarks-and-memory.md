# ADR 015: Benchmarks and memory

- Status: Accepted
- Date: 2026-10-09
- Phase: 2

## Context

SPEC fixes performance budgets (60 fps and no main-thread task over 50 ms with 1000 pages; reordering, rotating and deleting under 100 ms; merging 20 files and 500 pages without blocking and with visible progress) and asks that the memory used with 500 pages be measured and that the 250 MB warning threshold be adjusted with those data.

## Decision

- **The suite lives in `benchmarks/`** (a private workspace package) and is run with `pnpm bench`: Playwright drives headless Chromium against the **production build** (a server it starts itself, never a reused one) and writes `benchmarks/RESULTS.md` with the date, version, machine and browser. Large documents are generated on first use from fixed seeds into an ignored folder (1000 text pages, 500 text pages, 500 scanned pages of about 195 KB each, 20 files of 25 pages).
- **Each scenario runs with the main thread as it is and throttled four times**, a stand-in for the mid-range laptop of SPEC. The throttle does not reach workers, which the report says.
- **How things are measured.** Scrolling: animation frame gaps while the grid moves at a constant speed (steady and fling) plus long tasks from `PerformanceObserver`. Interactions: from the key press to two animation frames later (the painted result; about 33 ms of that is waiting for frames), plus the cost of the handler on its own. Progress: every distinct value the progress bar shows. **Memory:** the resident size the operating system reports for the browser's renderer processes (page and workers together, through `ps`), sampled every 100 ms to catch peaks; each scenario has a browser context, hence a process, of its own. It works on macOS and Linux and only in Chromium.
- **Budgets are enforced only where SPEC gives one**, as ✓ or ✗ in the report. CI does not run the suite (shared runners are noisy); a manual workflow does, and uploads the report.

## Results (2026-10-09, Apple M4, 24 GB, Chromium 156)

All budgets are met, also with the main thread four times slower: 60 fps in a steady scroll and a 12 000 px/s fling over 1000 pages with no frame over 20 ms and no long task; reordering, rotating or deleting 1 to 1000 pages in about 31 ms painted (the handler itself takes 0.1 to 1.8 ms); merging 20 files and 500 pages in 1.5 s with 29 to 33 distinct progress values and no long task; the first thumbnails of a 1000-page document in 0.3 to 0.4 s. Slowest operations: working out a size split of 500 pages (5.4 s), pictures of 500 pages at 150 dpi (6.8 s). See `benchmarks/RESULTS.md` for every number.

**Memory (resident, browser renderers):**

| Case                                                  | Memory  |
| ----------------------------------------------------- | ------- |
| Empty application                                     | 125 MB  |
| 500 text pages (1.2 MB), after scrolling through them | 500 MB  |
| 500 scanned pages (97.5 MB), after loading            | 682 MB  |
| the same, after scrolling through every page          | 1129 MB |
| the same, peak while exporting one PDF                | 1346 MB |
| 500 scanned pages to JPEGs at 150 dpi, peak           | 1362 MB |

A line through these: about 125 MB for the application, 375 MB more once a document is on screen (thumbnails and pdf.js), and about **6.5 MB for every MB of scanned PDF**; exporting adds a quarter of a gigabyte.

## The threshold

SPEC guessed 250 MB of loaded PDFs. By the line above that is about 2.1 GB of memory (2.3 GB while exporting), too close to what a tab can take on an 8 GB computer. **The warning now appears at 150 MB** (about 1.5 GB steady), and its text says to export in parts or remove a file. Text-heavy PDFs cost much less per megabyte, but the application cannot know that before loading.

## What the measurements found and fixed

- **Pictures of a scanned document used 4.8 GB** because pdf.js kept every decoded page and each full-size canvas waited for the garbage collector. Trimming pdf.js's caches every 20 pages and releasing each canvas after encoding brought it to 1.4 GB and made it slightly faster.
- **Loading kept three or four copies of the file in flight.** Each worker now gets a freshly read copy that is moved, not copied, and pdf.js takes it without another copy: the peak of loading the 97 MB scan fell from 876 MB to 682 MB.
- **Scanned documents did not show thumbnails at all** because pdf.js needed a scratch canvas it could not create in a worker (ADR 009). Not a performance finding, but the benchmark was the first thing to use a picture big enough to hit it.
- Trimming pdf.js's caches while drawing _thumbnails_ was tried and measured no difference, so it was removed.

## Consequences

- Reports are dated and tied to a commit; a regression shows as a ✗ the next time the suite runs.
- The numbers describe one machine. The 4x column is a proxy, not a measurement on a real mid-range laptop.
- Memory in Safari and Firefox is not measured.
