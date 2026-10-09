/**
 * pdf.js builds canvases and SVG filters through factories that default to the DOM. Inside a
 * worker there is no `document`, so any page that needs an intermediate canvas (a large picture
 * drawn smaller, for instance) fails with "Cannot read properties of undefined (reading
 * 'createElement')". These replacements use OffscreenCanvas and no filters, which is all a
 * thumbnail or a picture export needs.
 */

export interface CanvasAndContext {
  canvas: OffscreenCanvas | null;
  context: OffscreenCanvasRenderingContext2D | null;
}

export class WorkerCanvasFactory {
  create(
    width: number,
    height: number,
  ): { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('A 2D canvas context is not available');
    return { canvas, context };
  }

  reset(target: CanvasAndContext, width: number, height: number): void {
    if (target.canvas === null) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: CanvasAndContext): void {
    // Shrinking the canvas hands its memory back at once instead of when the garbage collector runs.
    if (target.canvas !== null) {
      target.canvas.width = 0;
      target.canvas.height = 0;
    }
    target.canvas = null;
    target.context = null;
  }
}

/** pdf.js only asks for filters for high-contrast mode and some blend effects; "none" draws without them. */
export class NoFilterFactory {
  addFilter(): string {
    return 'none';
  }

  addHCMFilter(): string {
    return 'none';
  }

  addAlphaFilter(): string {
    return 'none';
  }

  addLuminosityFilter(): string {
    return 'none';
  }

  addHighlightHCMFilter(): string {
    return 'none';
  }

  destroy(): void {
    // Nothing was created, so there is nothing to release.
  }
}
