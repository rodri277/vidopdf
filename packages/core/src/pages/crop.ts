import type { Rotation } from '../workspace/page-ref';
import type { Size } from '../stamps/placement';

/**
 * How much of each edge is cut away, as a fraction of the page's width (left, right) or height
 * (top, bottom). Given as the reader sees the page, so turning a page does not move the cut.
 */
export interface Margins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

/** What is left must stay at least this much of the page along each axis. */
export const MIN_REMAINING = 0.1;

export function isCrop(margins: Margins): boolean {
  return margins.top > 0 || margins.right > 0 || margins.bottom > 0 || margins.left > 0;
}

/** A crop that is valid: no negative or non-finite margin, and something left of the page. */
export function normalizeCrop(margins: Margins): Margins {
  const clean = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
  const fit = (a: number, b: number): [number, number] => {
    const room = 1 - MIN_REMAINING;
    const sum = a + b;
    return sum <= room ? [a, b] : [(a / sum) * room, (b / sum) * room];
  };
  const [left, right] = fit(clean(margins.left), clean(margins.right));
  const [top, bottom] = fit(clean(margins.top), clean(margins.bottom));
  return { top, right, bottom, left };
}

/** The same cut in the page's stored orientation (where the writer sets the crop box). */
export function toStoredMargins(margins: Margins, rotation: Rotation): Margins {
  switch (rotation) {
    case 0:
      return margins;
    case 90:
      return { left: margins.top, bottom: margins.left, right: margins.bottom, top: margins.right };
    case 180:
      return { left: margins.right, right: margins.left, top: margins.bottom, bottom: margins.top };
    case 270:
      return { top: margins.left, right: margins.top, bottom: margins.right, left: margins.bottom };
  }
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The crop box, in the page's stored coordinates (origin bottom-left), for a page of `page` size. */
export function cropBox(page: Size, display: Margins, rotation: Rotation): Box {
  const stored = toStoredMargins(normalizeCrop(display), rotation);
  return {
    x: stored.left * page.width,
    y: stored.bottom * page.height,
    width: page.width * (1 - stored.left - stored.right),
    height: page.height * (1 - stored.top - stored.bottom),
  };
}
