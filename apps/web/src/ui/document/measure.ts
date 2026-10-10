/** Inter's line height (ascent plus descent) as a multiple of the font size; the writer uses the font's own metrics. */
export const LINE_HEIGHT = 1.21;

let context: CanvasRenderingContext2D | null | undefined;

/**
 * Width in points of a line of text set in the interface font (the same family the PDF embeds, so
 * the preview matches the result to a fraction of a point). 0.55 em per character is the fallback
 * when a canvas is not available.
 */
export function measureText(text: string, size: number, bold: boolean): number {
  context ??= document.createElement('canvas').getContext('2d');
  if (context === null) return text.length * size * 0.55;
  context.font = `${bold ? '700' : '400'} ${String(size)}px "Inter Variable", Inter, sans-serif`;
  return context.measureText(text).width;
}
