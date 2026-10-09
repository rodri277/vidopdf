# ADR 005: License policy

- Status: Accepted for everything except the Liberation fonts exception, which is **Proposed** until Rodrigo approves it (see below)
- Date: 2026-10-09
- Phase: 0

## Context

Vidopdf is MIT licensed and ships third-party code and data to every visitor. SPEC.md allows MIT, Apache-2.0, BSD, ISC and CC0 (plus OFL-1.1 for the fonts), and nothing GPL or AGPL except approved exceptions.

## Decision

- `tools/check-licenses.mjs` scans the production dependencies of every workspace and fails the build on any license outside the allowed set (MIT, Apache-2.0, BSD-2/3-Clause, ISC, CC0-1.0, OFL-1.1, 0BSD). It also regenerates `THIRD_PARTY_LICENSES.md`, and CI fails if that file is stale.
- The build copies `THIRD_PARTY_LICENSES.md` to the deployed site as `/THIRD_PARTY_LICENSES.txt`, linked from the footer, because what we distribute is the site and not the repository. The in-app Licenses page (SPEC "Cumplimiento legal") comes in Phase 3.
- Pieces that pdfjs-dist ships under their own licenses (CMaps BSD-3, OpenJPEG BSD-2, JBIG2 BSD-3, qcms MIT, Foxit fonts BSD-3, ICC profiles CC0) are copied to `/pdfjs/` with their LICENSE files next to them and listed in the generated file.
- `quickjs-eval` (pdf.js' sandbox for scripts embedded in PDFs) is deliberately not served: Vidopdf never runs PDF scripts.
- **Development-only exception:** `@axe-core/playwright` is MPL-2.0 (file-level copyleft). It is used only in tests, is not distributed and is not bundled, so no obligation attaches. The scan covers production dependencies only.

### Liberation fonts (GPL-2.0 with font exception) — proposed exception

pdf.js falls back to Liberation Sans when a PDF refers to a standard font (Helvetica, Arial) without embedding it. They are the only GPL piece. Served unmodified, as separate files, with their license text beside them (`/pdfjs/standard_fonts/LICENSE_LIBERATION`), they do not make Vidopdf a derivative work, and the font exception covers documents rendered with them.

Until Rodrigo decides, they are served (the spike renders correctly with them). The alternative is to remove `LiberationSans-*.ttf` from the copied assets and accept that pdf.js then falls back to the Foxit fonts, which render those PDFs less faithfully. The decision should be taken with screenshots of both cases, as SPEC asks, before v1.0.0.

## Alternatives considered

- **No license automation.** Easy to miss a transitive dependency; the Vidopix project had a missing-notice bug that this avoids.
- **Allow GPL dependencies generally.** Contradicts the SPEC and the MIT license of the project.

## Consequences

- Adding a dependency with a license outside the list breaks CI until it is reviewed and either rejected or added here with a reason.
- The generated notice file grows with the dependency tree and must be committed with each dependency change.
