import type { Rotation } from '../workspace/page-ref';
import type { Anchor, Stamp } from './stamp';

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Two coordinate systems meet here, and mixing them up is how stamps end up sideways:
 *
 * - **Display space**: what the reader sees after the page's own rotation. Origin at the top-left,
 *   y grows downwards. The preview and the form work in it.
 * - **PDF space**: the page as stored, before its rotation. Origin at the bottom-left, y grows
 *   upwards. The writer works in it.
 *
 * Everything below is pure, and the preview and the writer call the same functions, so what is
 * shown is what is exported.
 */

/** The size of the page as the reader sees it. */
export function displaySize(page: Size, rotation: Rotation): Size {
  return rotation % 180 === 0 ? page : { width: page.height, height: page.width };
}

const HORIZONTAL: Record<Anchor, 'left' | 'center' | 'right'> = {
  topLeft: 'left',
  middleLeft: 'left',
  bottomLeft: 'left',
  topCenter: 'center',
  center: 'center',
  bottomCenter: 'center',
  topRight: 'right',
  middleRight: 'right',
  bottomRight: 'right',
};

const VERTICAL: Record<Anchor, 'top' | 'middle' | 'bottom'> = {
  topLeft: 'top',
  topCenter: 'top',
  topRight: 'top',
  middleLeft: 'middle',
  center: 'middle',
  middleRight: 'middle',
  bottomLeft: 'bottom',
  bottomCenter: 'bottom',
  bottomRight: 'bottom',
};

/** Top-left corner, in display space, of a box of `box` size placed at an anchor. */
export function anchoredBox(anchor: Anchor, page: Size, box: Size, margin: number): Point {
  const horizontal = HORIZONTAL[anchor];
  const vertical = VERTICAL[anchor];
  const x =
    horizontal === 'left'
      ? margin
      : horizontal === 'center'
        ? (page.width - box.width) / 2
        : page.width - box.width - margin;
  const y =
    vertical === 'top'
      ? margin
      : vertical === 'middle'
        ? (page.height - box.height) / 2
        : page.height - box.height - margin;
  return { x, y };
}

/** A point given as the reader sees the page, in the page's stored coordinates. */
export function displayToPdf(point: Point, display: Size, rotation: Rotation): Point {
  const stored = displaySize(display, rotation);
  switch (rotation) {
    case 0:
      return { x: point.x, y: stored.height - point.y };
    case 90:
      return { x: point.y, y: point.x };
    case 180:
      return { x: stored.width - point.x, y: point.y };
    case 270:
      return { x: stored.width - point.y, y: stored.height - point.x };
  }
}

export interface Placement {
  /** Centre of the stamp, in display space. */
  readonly center: Point;
  readonly box: Size;
  /** Counter-clockwise as the reader sees it. */
  readonly angle: number;
}

/** Where a stamp of the given box size goes on a page, as the reader sees it. */
export function placeStamp(stamp: Stamp, display: Size, box: Size): Placement {
  const corner = anchoredBox(stamp.anchor, display, box, stamp.margin);
  return {
    center: { x: corner.x + box.width / 2, y: corner.y + box.height / 2 },
    box,
    angle: stamp.rotation,
  };
}

export interface PdfPlacement {
  /** Centre of the stamp, in the page's stored coordinates. */
  readonly center: Point;
  /** Bottom-left corner of the (rotated) box: where a text or picture is drawn from. */
  readonly origin: Point;
  /** Counter-clockwise, in the page's stored coordinates. */
  readonly angle: number;
  readonly box: Size;
}

const normalizeAngle = (degrees: number): number => {
  const turned = ((degrees % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
};

/** The same placement in the page's stored coordinates, ready for the writer. */
export function toPdfPlacement(
  placement: Placement,
  display: Size,
  rotation: Rotation,
): PdfPlacement {
  const center = displayToPdf(placement.center, display, rotation);
  // The page is turned for display, so the stamp has to be turned the other way to stay upright.
  const angle = normalizeAngle(placement.angle + rotation);
  const radians = (angle * Math.PI) / 180;
  const [halfWidth, halfHeight] = [placement.box.width / 2, placement.box.height / 2];
  return {
    center,
    angle,
    box: placement.box,
    origin: {
      x: center.x - halfWidth * Math.cos(radians) + halfHeight * Math.sin(radians),
      y: center.y - halfWidth * Math.sin(radians) - halfHeight * Math.cos(radians),
    },
  };
}
