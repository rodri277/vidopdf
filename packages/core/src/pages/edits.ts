import type { Size } from '../stamps/placement';
import type { Margins } from './crop';

/**
 * A picture placed on one page by the user (a visual signature). Position and size are fractions
 * of the page as the reader sees it, so the same placement works at any zoom and survives turning
 * the page's own rotation into the preview.
 */
export interface Overlay {
  readonly id: string;
  /** An image registered with the export worker. */
  readonly assetId: string;
  /** Left edge, as a fraction of the displayed width. */
  readonly x: number;
  /** Top edge, as a fraction of the displayed height. */
  readonly y: number;
  /** Width, as a fraction of the displayed width. */
  readonly width: number;
  /** Height of the picture divided by its width. */
  readonly aspect: number;
}

/** What the user did to one page besides turning it. */
export interface PageEdits {
  readonly crop?: Margins;
  readonly overlays?: readonly Overlay[];
}

export type EditsByPage = Readonly<Record<string, PageEdits>>;

export function isEmptyEdits(edits: PageEdits): boolean {
  return edits.crop === undefined && (edits.overlays?.length ?? 0) === 0;
}

export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The overlay as a rectangle on the displayed page, in points. */
export function overlayRectangle(overlay: Overlay, display: Size): Rectangle {
  const width = overlay.width * display.width;
  return {
    x: overlay.x * display.width,
    y: overlay.y * display.height,
    width,
    height: width * overlay.aspect,
  };
}

/** Moves an overlay back inside the page if a drag or a resize took it out. */
export function keepOverlayInside(overlay: Overlay, display: Size): Overlay {
  const width = Math.min(Math.max(overlay.width, 0.02), 1);
  const heightFraction = (width * display.width * overlay.aspect) / display.height;
  return {
    ...overlay,
    width,
    x: Math.min(Math.max(overlay.x, 0), Math.max(0, 1 - width)),
    y: Math.min(Math.max(overlay.y, 0), Math.max(0, 1 - heightFraction)),
  };
}
