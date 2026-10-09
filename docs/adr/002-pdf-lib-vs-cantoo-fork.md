# ADR 002: @cantoo/pdf-lib instead of pdf-lib

- Status: Accepted
- Date: 2026-10-09
- Phase: 0

## Context

Vidopdf builds the output PDF with pdf-lib: copy pages between documents, rotate, set metadata and, in v2, encrypt. Facts checked on the npm registry on 2026-10-09:

- `pdf-lib` (Hopding) has had no release since May 2022 and cannot encrypt or decrypt.
- `@cantoo/pdf-lib` 2.11.1 is a maintained fork under the same MIT license. It adds encryption (AES-256 by default) and loading of encrypted documents.

## Decision

Use `@cantoo/pdf-lib`. A Phase 0 spike (`packages/pdf-adapters/src/pdflib-writer.test.ts`) shows it merges pages from several sources, preserves page sizes and adds rotations on top of an existing one; the output passes `qpdf --check`, and encrypted fixtures (owner-restricted and user-password) are detected through `PDFDocument.load(..., { ignoreEncryption: true })` and rejected, as v1 requires.

The adapter is the only code that imports it, so going back to `pdf-lib` or to another engine is a change inside `pdf-adapters`.

## Alternatives considered

- **`pdf-lib` (original).** Unmaintained and without encryption. Phase 4 would need a second library.
- **qpdf compiled to WASM (npm `qpdf-wasm`).** Its package omits qpdf's license and the notices of its compiled dependencies, and adds a large binary. qpdf stays a test-only tool.
- **MuPDF (WASM).** Powerful but AGPL; only relevant as a compression option, decided in the Phase 3 ADR.

## Consequences

- One engine covers merge, split, rotate, metadata and encryption.
- We depend on a fork with a small maintainer base. Mitigation: the adapter boundary and the fixture suite make a replacement testable.
- Known `copyPages` limits (bookmarks, tagging, form links) are verified with fixtures in Phase 1 and documented as limitations.
