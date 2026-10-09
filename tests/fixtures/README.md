# Test fixtures

Every fixture states where it comes from and under what license. Never add real documents with personal data.

## `generated/` — made by code

Produced by `packages/pdf-adapters/scripts/generate-fixtures.mjs` (run `node packages/pdf-adapters/scripts/generate-fixtures.mjs`) with `@cantoo/pdf-lib` (pictures drawn with `@napi-rs/canvas`, test-only). They contain only synthetic text such as "A-1". License: MIT, same as the project. Non-encrypted files are deterministic (fixed dates); the encrypted ones carry random IDs and change on regeneration.

| File | Pages | Purpose |
| --- | --- | --- |
| `mixed-sizes-3p.pdf` | 3 | A4, Letter and a small landscape page |
| `rotated-2p.pdf` | 2 | Second page carries `/Rotate 90` |
| `single-1p.pdf` | 1 | Smallest valid case |
| `bookmarks-3p.pdf` | 3 | An outline with one entry per page (what `copyPages` loses) |
| `bookmarks-nested-6p.pdf` | 6 | Two levels of bookmarks reached by direct and named destinations, plus one with no destination and one pointing at a page that does not exist |
| `form-1p.pdf` | 1 | AcroForm with a text field and a checkbox |
| `tagged-2p.pdf` | 2 | `/MarkInfo`, `/Lang` and an empty `/StructTreeRoot` |
| `links-1p.pdf` | 1 | An external link annotation |
| `images-2p.pdf` | 2 | One PNG and one JPEG picture (gradients drawn by code) |
| `scanned-2p.pdf` | 2 | Full-page JPEGs of pseudo-text, no text layer: a stand-in for a scan |
| `pages-300.pdf` | 300 | Performance and merge-order tests ("PAGE n" on each page) |
| `encrypted-owner-restricted.pdf` | 1 | Empty user password, owner password set, printing, copying and modifying denied. v1 rejects it. |
| `encrypted-user-password.pdf` | 1 | Needs a password to open. v1 rejects it. |
| `truncated.pdf` | — | `mixed-sizes-3p.pdf` cut in half (damaged xref) |
| `zero-bytes.pdf` | — | Empty file |
| `not-a-pdf.pdf` | — | Plain text with a `.pdf` name |

Real-world public-domain or CC0 samples (a true scan, a government form) are still to come; the generated ones above stand in for them and are enough to test behaviour deterministically. Each one added later lists its source and license here. Do not copy files from the pdf.js corpus without reviewing each license.

## `generated/big/` — not committed

`node packages/pdf-adapters/scripts/generate-fixtures.mjs --big` writes `big/pages-1000.pdf` (1000 pages, 30 lines of text each), used by the benchmarks. It is ignored by git because of its size and is deterministic, like the rest.
