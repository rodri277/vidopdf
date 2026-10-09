/** Largest canvas we are willing to allocate; protects against memory bombs (SPEC "Seguridad"). */
export const MAX_CANVAS_PIXELS = 16_777_216; // 4096 x 4096

/** Soft warning above this much loaded PDF data (SPEC). Revisited with measurements in Phase 2. */
export const MEMORY_WARNING_BYTES = 250 * 1024 * 1024;
