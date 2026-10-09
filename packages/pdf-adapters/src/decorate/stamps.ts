import { degrees } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFPage } from '@cantoo/pdf-lib';
import { pdfError, placeStamp, renderTemplate, stampsFor, toPdfPlacement } from '@vidopdf/core';
import type { Decorations, ImageStamp, PdfError, Placement, TextStamp } from '@vidopdf/core';
import type { FontSession } from '../fonts/font-session';
import type { ImageCache } from './images';
import { viewOf } from './page-geometry';
import type { PageView } from './page-geometry';

export interface StampEnv {
  readonly doc: PDFDocument;
  readonly fonts: FontSession;
  readonly images: ImageCache;
  readonly decorations: Decorations;
  readonly total: number;
}

async function drawText(
  page: PDFPage,
  view: PageView,
  stamp: TextStamp,
  index: number,
  env: StampEnv,
): Promise<PdfError | undefined> {
  const { decorations: deco } = env;
  const text = renderTemplate(stamp.template, {
    n: index + stamp.startAt,
    total: env.total,
    file: deco.fileName,
    date: deco.date,
  });
  const laid = await env.fonts.layout(text, stamp.bold);
  if (laid.unsupported.length > 0) {
    return pdfError(
      'unsupported',
      `characters without a glyph: ${[...new Set(laid.unsupported)].join(' ')}`,
    );
  }
  const metrics = env.fonts.metrics(laid, stamp.fontSize);
  const placed = toPdfPlacement(
    placeStamp(stamp, view.display, { width: metrics.width, height: metrics.height }),
    view.display,
    view.rotation,
  );
  await env.fonts.draw(page, laid, metrics, {
    x: placed.origin.x + view.x,
    y: placed.origin.y + view.y,
    size: stamp.fontSize,
    angle: placed.angle,
    color: stamp.color,
    opacity: stamp.opacity,
  });
  return undefined;
}

async function drawImage(
  page: PDFPage,
  view: PageView,
  stamp: ImageStamp,
  env: StampEnv,
): Promise<PdfError | undefined> {
  const pending = env.images.get(stamp.assetId);
  if (pending === undefined)
    return pdfError('unsupported', `picture ${stamp.assetId} is missing or not PNG or JPEG`);
  const image = await pending;
  const box = { width: stamp.width, height: stamp.width * (image.height / image.width) };
  const placement: Placement = placeStamp(stamp, view.display, box);
  const placed = toPdfPlacement(placement, view.display, view.rotation);
  page.drawImage(image, {
    x: placed.origin.x + view.x,
    y: placed.origin.y + view.y,
    width: box.width,
    height: box.height,
    rotate: degrees(placed.angle),
    opacity: stamp.opacity,
  });
  return undefined;
}

/** Draws every stamp that applies on every page of the finished document. */
export async function applyStamps(env: StampEnv): Promise<PdfError | undefined> {
  const pages = env.doc.getPages();
  for (const [index, page] of pages.entries()) {
    const view = viewOf(page);
    for (const stamp of stampsFor(env.decorations.stamps, index, pages.length)) {
      const failure =
        stamp.kind === 'text'
          ? await drawText(page, view, stamp, index, env)
          : await drawImage(page, view, stamp, env);
      if (failure !== undefined) return failure;
    }
  }
  return undefined;
}
