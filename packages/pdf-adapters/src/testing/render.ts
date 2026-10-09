import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfjsDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const assets = (name: string) => `${join(pdfjsDir, name)}/`;

export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Test helper: draws one page (1-based) with pdf.js in Node. `rotation` overrides /Rotate. */
export async function renderPage(
  bytes: Uint8Array,
  pageNumber: number,
  options: { scale?: number; rotation?: number } = {},
): Promise<Raster> {
  const task = getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    standardFontDataUrl: assets('standard_fonts'),
    cMapUrl: assets('cmaps'),
    cMapPacked: true,
  });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({
    scale: options.scale ?? 0.5,
    ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
  });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  // pdf.js types ask for the DOM canvas classes; @napi-rs/canvas has the same drawing API.
  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  }).promise;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const raster = { width: image.width, height: image.height, data: image.data };
  await task.destroy();
  return raster;
}

function largestChannelDelta(a: Raster, b: Raster, offset: number): number {
  let largest = 0;
  for (let channel = 0; channel < 3; channel++) {
    largest = Math.max(
      largest,
      Math.abs((a.data[offset + channel] ?? 0) - (b.data[offset + channel] ?? 0)),
    );
  }
  return largest;
}

/** Fraction of pixels whose largest channel difference exceeds `tolerance` (0 to 255). */
export function differingPixels(a: Raster, b: Raster, tolerance = 8): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let different = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    if (largestChannelDelta(a, b, offset) > tolerance) different++;
  }
  return different / (a.width * a.height);
}
