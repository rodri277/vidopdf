import { MAX_CANVAS_PIXELS } from '@vidopdf/core';

/** Chooses a render scale that hits the requested width without exceeding the pixel budget. */
export function pickScale(pageWidth: number, pageHeight: number, targetWidth: number): number {
  const wanted = targetWidth / pageWidth;
  const allowed = Math.sqrt(MAX_CANVAS_PIXELS / (pageWidth * pageHeight));
  return Math.min(wanted, allowed);
}
