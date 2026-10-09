import { degrees } from '@cantoo/pdf-lib';
import type { PDFPage } from '@cantoo/pdf-lib';
import { overlayRectangle, pdfError, toPdfPlacement } from '@vidopdf/core';
import type { Overlay, PdfError } from '@vidopdf/core';
import type { ImageCache } from './images';
import { viewOf } from './page-geometry';

/** Puts the signatures a user placed on a page, where they were placed as the reader sees it. */
export async function drawOverlays(
  page: PDFPage,
  overlays: readonly Overlay[],
  images: ImageCache,
): Promise<PdfError | undefined> {
  const view = viewOf(page);
  for (const overlay of overlays) {
    const pending = images.get(overlay.assetId);
    if (pending === undefined)
      return pdfError('unsupported', `picture ${overlay.assetId} is missing or not PNG or JPEG`);
    await pending;
    const rectangle = overlayRectangle(overlay, view.display);
    const placed = toPdfPlacement(
      {
        center: { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 },
        box: { width: rectangle.width, height: rectangle.height },
        angle: 0,
      },
      view.display,
      view.rotation,
    );
    page.drawImage(await pending, {
      x: placed.origin.x + view.x,
      y: placed.origin.y + view.y,
      width: rectangle.width,
      height: rectangle.height,
      rotate: degrees(placed.angle),
    });
  }
  return undefined;
}
