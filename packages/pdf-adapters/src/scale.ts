/** Largest canvas we are willing to allocate; protects against memory bombs (SPEC §Seguridad). */
export const MAX_CANVAS_PIXELS = 16_777_216; // 4096 x 4096

/** Chooses a render scale that hits the requested width without exceeding the pixel budget. */
export function pickScale(pageWidth: number, pageHeight: number, targetWidth: number): number {
  const wanted = targetWidth / pageWidth;
  const allowed = Math.sqrt(MAX_CANVAS_PIXELS / (pageWidth * pageHeight));
  return Math.min(wanted, allowed);
}
