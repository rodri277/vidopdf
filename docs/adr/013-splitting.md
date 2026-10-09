# ADR 013: Splitting PDFs

- Status: Accepted
- Date: 2026-10-09
- Phase: 2

## Context

SPEC asks for four ways to split (by ranges, every N pages, by bookmarks, by maximum size), extraction of pages, and a ZIP when there are several files. Every mode has to be provable: no page lost, none repeated, and the size limit kept in every case or refused with a reason.

## Decision

- **Splitting works on the workspace, not on the files.** The pages to split are what the grid shows, in its order and with its rotations and blank pages. A split is a list of `PageGroup`s, each becomes one output of an `ExportPlan`, and the same worker that exports one PDF builds them all.
- **Pure planners in `core`.** `parseRanges` reports the first mistake with the text that caused it; `analyzeRanges` lists pages used twice and pages left out; `splitByRanges`, `splitEveryN` and `splitByBookmarks` are partitions. A page named by two ranges appears in both files (it is what was typed, and the dialog says so); with the rest collected, ranges that do not overlap use every page exactly once. Property tests check coverage, order and the absence of repeats.
- **Bookmarks come from the original files.** Merging with pdf-lib drops the outline (ADR 002), so the cut points are read from each source with pdf.js (`readOutline`: direct, named and numeric destinations; entries that lead nowhere are skipped; at most 32 levels and 10 000 entries) and matched to the pages that came from it. A page that is the target of a bookmark opens a new file, named after the bookmark; pages before the first one form a leading file, so nothing is dropped. The level is chosen in the dialog (1 is the top).
- **Maximum size is measured, never estimated.** `splitBySize` takes a `measure` function that really builds the candidate PDF. It fills each file by doubling and then bisecting, about log2(length) measurements per file, and fails naming the page when one page alone is over the limit. The export worker keeps each source parsed while its bytes live, which is what makes repeated builds affordable. The limit is held in every case of the corpus: `size-split-corpus.test.ts` splits every readable fixture at seven limits from 200 bytes to twice the file size, and either every file measures under the limit or the error names a page that really is over it on its own.
- **Output.** One group gives one PDF; several give a ZIP built entry by entry with fflate (PDFs deflated, since written without object streams they compress well). File names are made safe, readable (`report_p1-3.pdf`, `book - Chapter 2.pdf`) and unique ignoring case.
- **Extract** is the selected pages, in document order, as one PDF. **Split here** opens the dialog with two ranges ready, cutting after the last selected page.

## Alternatives considered

- **Estimate the size of a group from the sizes of its pages.** Fast, but shared resources (fonts, images used twice) make the estimate wrong in both directions and the limit could be broken.
- **Binary search over the whole document at once.** Needs a monotone size for any slice, not just prefixes of a group; the greedy fill only assumes that adding a page never makes a PDF smaller.
- **Read bookmarks from the merged result.** There are none to read.

## Consequences

- Splitting by size takes seconds on a big document (5.4 s for 500 pages in the benchmarks) because it builds real PDFs; the dialog shows progress and can cancel.
- Splitting by bookmarks only sees the bookmarks of the original files and is documented as such.
- A document where every page is bigger than the limit cannot be split by size; the message says which page.
