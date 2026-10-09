import type { PDFPage } from '@cantoo/pdf-lib';
import { displaySize } from '@vidopdf/core';
import type { Rotation, Size } from '@vidopdf/core';

export interface PageView {
  /** The area the reader sees: the crop box if there is one, else the media box. */
  readonly x: number;
  readonly y: number;
  /** The page's own rotation, brought to a quarter turn. */
  readonly rotation: Rotation;
  /** Size of what the reader sees, after the rotation. */
  readonly display: Size;
}

/** Some files carry /Rotate -90 or 450; both mean what 270 and 90 do. */
export function quarterTurn(angle: number): Rotation {
  const turned = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  return turned as Rotation;
}

export function viewOf(page: PDFPage): PageView {
  const box = page.getCropBox();
  const rotation = quarterTurn(page.getRotation().angle);
  return {
    x: box.x,
    y: box.y,
    rotation,
    display: displaySize({ width: box.width, height: box.height }, rotation),
  };
}
