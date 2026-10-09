import { createCompressor } from './compress';
import type { ImageCodec, Raster } from './codec';

/** Picture codec on OffscreenCanvas, for the export worker. */
const browserCodec: ImageCodec = {
  async decodeJpeg(bytes) {
    // "none": a PDF's JPEG has no EXIF rotation and no colour management of its own to apply.
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }), {
      imageOrientation: 'none',
      colorSpaceConversion: 'none',
    });
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('A 2D canvas context is not available');
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: bitmap.width, height: bitmap.height, data };
    } finally {
      bitmap.close();
    }
  },

  async encodeJpeg(raster: Raster, width: number, height: number, quality: number) {
    const source = new OffscreenCanvas(raster.width, raster.height);
    const sourceContext = source.getContext('2d');
    const target = new OffscreenCanvas(width, height);
    const targetContext = target.getContext('2d');
    if (sourceContext === null || targetContext === null)
      throw new Error('A 2D canvas context is not available');
    sourceContext.putImageData(
      new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height),
      0,
      0,
    );
    targetContext.imageSmoothingQuality = 'high';
    targetContext.drawImage(source, 0, 0, width, height);
    // Free the full-size copy before the encoder runs: it can be tens of megabytes.
    source.width = 0;
    source.height = 0;
    const blob = await target.convertToBlob({ type: 'image/jpeg', quality });
    target.width = 0;
    target.height = 0;
    if (blob.type !== 'image/jpeg') throw new Error('This browser cannot encode JPEG');
    return new Uint8Array(await blob.arrayBuffer());
  },
};

/** The compressor wired to the browser's own image codec. Only workers may import this. */
export function createBrowserCompressor() {
  return createCompressor(browserCodec);
}
