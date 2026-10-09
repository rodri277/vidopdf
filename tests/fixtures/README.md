# Test fixtures

Every fixture states where it comes from and under what license. Never add real documents with personal data.

## `generated/` — made by code

Produced by `packages/pdf-adapters/scripts/generate-fixtures.mjs` (run `node packages/pdf-adapters/scripts/generate-fixtures.mjs`) with `@cantoo/pdf-lib`. They contain only synthetic text such as "A-1". License: MIT, same as the project. Non-encrypted files are deterministic (fixed dates); the encrypted ones carry random IDs and change on regeneration.

| File | Pages | Purpose |
| --- | --- | --- |
| `mixed-sizes-3p.pdf` | 3 | A4, Letter and a small landscape page |
| `rotated-2p.pdf` | 2 | Second page carries `/Rotate 90` |
| `single-1p.pdf` | 1 | Smallest valid case |
| `encrypted-owner-restricted.pdf` | 1 | Empty user password, owner password set, printing, copying and modifying denied. v1 rejects it. |
| `encrypted-user-password.pdf` | 1 | Needs a password to open. v1 rejects it. |
| `truncated.pdf` | — | `mixed-sizes-3p.pdf` cut in half (damaged xref) |
| `zero-bytes.pdf` | — | Empty file |
| `not-a-pdf.pdf` | — | Plain text with a `.pdf` name |

Fixtures from the public domain or CC0 (scanned, with bookmarks, with forms, tagged) arrive in Phase 1 with their source and license listed here. Do not copy files from the pdf.js corpus without reviewing each license.
