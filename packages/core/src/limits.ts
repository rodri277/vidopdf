/** Largest canvas we are willing to allocate; protects against memory bombs (SPEC "Seguridad"). */
export const MAX_CANVAS_PIXELS = 16_777_216; // 4096 x 4096

/**
 * Soft warning above this much loaded PDF data. SPEC's first guess was 250 MB; the Phase 2
 * benchmarks (docs/adr/015) measured about 0.5 GB of browser memory for the application with a
 * 500-page document in view plus roughly 6.5 MB for every MB of scanned PDF, so 250 MB of PDFs
 * means about 2.1 GB and exporting adds a quarter of a gigabyte on top. 150 MB keeps the steady
 * state near 1.5 GB, which a typical 8 GB computer carries without trouble.
 */
export const MEMORY_WARNING_BYTES = 150 * 1024 * 1024;
