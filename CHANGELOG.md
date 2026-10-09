# Changelog

Generated from commit messages by `node tools/changelog.mjs`.

## v0.3.0 (2026-10-09)

### Features

- Phase 2 block 5: benchmarks, memory work and the Phase 2 close (#12)
- Phase 2 block 4: the interface for split, extract and pictures (#11)
- Phase 2 block 3: workers and state for split, extract, pictures and import (#10)
- Phase 2 block 2: adapters for outlines, images, ZIP and image to PDF (#9)
- Phase 2 block 1: split strategies, multi-output plans and image logic in core (#8)

## v0.2.0 (2026-10-09)

### Features

- Phase 1 block 5: panels, preview and export dialog (#6)
- Phase 1 block 4: virtualized grid, selection and reordering (#5)
- Phase 1 block 3: workers, thumbnail pipeline and session store (#4)
- Phase 1 block 1: workspace domain, commands and history (#2)

### Tests

- Phase 1 block 2: fixtures, pixel comparison and copyPages limits (#3)

### Documentation

- close Phase 1 (ADRs, READMEs, changelog, three-file qpdf check) (#7)

## v0.1.0 (2026-10-09)

### Features

- **web:** stop serving the GPL Liberation fonts
- **web:** add the app shell, i18n, design tokens and the render and export workers
- **adapters:** merge pages with pdf-lib and render them with pdf.js
- **core:** add Result, PdfError, page selection and the PDF ports

### Fixes

- **deps:** match workspace package names in the layer rules
- **build:** normalize line endings in the generated license notices

### Tests

- **e2e:** cover privacy, hostile files, accessibility and the merge flow on Chromium and WebKit
- add code-generated PDF fixtures with documented provenance

### Build

- audit licenses and generate THIRD_PARTY_LICENSES.md

### CI

- add the verification workflow and repository templates

### Documentation

- add the Phase 0 ADRs, READMEs and security policy
- add the project specification and Claude Code guide

### Style

- format the dependency-cruiser config and lint .cjs files on commit

### Chores

- enforce the layer rules with dependency-cruiser and prove them with fixtures
- set up the pnpm monorepo, strict TypeScript and code style
