# Architecture decision records

Each record states the context, the decision, the alternatives that were rejected and the consequences. Numbered in the order the SPEC lists them; gaps are decisions that belong to a later phase.

| #                                                | Decision                                           | Phase       |
| ------------------------------------------------ | -------------------------------------------------- | ----------- |
| [001](001-monorepo-structure.md)                 | Monorepo structure                                 | 0           |
| [002](002-pdf-lib-vs-cantoo-fork.md)             | @cantoo/pdf-lib instead of pdf-lib                 | 0           |
| [003](003-layered-architecture.md)               | Layered architecture and enforced dependency rules | 0           |
| [004](004-compression-strategy.md)               | Compression strategy, with the spike data          | 3           |
| [005](005-license-policy.md)                     | License policy                                     | 0           |
| 006                                              | Encryption and forms engine                        | 4 (pending) |
| 007                                              | Offline and cache strategy                         | 5 (pending) |
| [008](008-toolchain-constraints.md)              | Toolchain version constraints                      | 0           |
| [009](009-pdfjs-inside-a-worker.md)              | pdf.js inside a Web Worker                         | 0           |
| [010](010-workspace-as-a-plan-of-commands.md)    | Workspace as a plan of commands                    | 1           |
| [011](011-thumbnail-pipeline.md)                 | Thumbnail pipeline                                 | 1           |
| [012](012-grid-virtualization-and-reordering.md) | Grid virtualization and reordering                 | 1           |
| [013](013-splitting.md)                          | Splitting                                          | 2           |
| [014](014-pictures-in-and-out.md)                | Pictures in and out                                | 2           |
| [015](015-benchmarks-and-memory.md)              | Benchmarks and memory                              | 2           |
| [016](016-legal-and-licensing-framework.md)      | Legal and licensing framework for v2               | 4           |
