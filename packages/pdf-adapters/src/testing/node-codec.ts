import { ImageData, createCanvas, loadImage } from '@napi-rs/canvas';
import type { ImageCodec } from '../compress/codec';

/** The picture codec on a Node canvas, so the compressor runs for real in tests and benchmarks. */
export const nodeCodec: ImageCodec = {
  async decodeJpeg(bytes) {
    const image = await loadImage(Buffer.from(bytes));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    return { width: image.width, height: image.height, data: new Uint8ClampedArray(data) };
  },

  encodeJpeg(raster, width, height, quality) {
    const source = createCanvas(raster.width, raster.height);
    source
      .getContext('2d')
      .putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
    const target = createCanvas(width, height);
    const context = target.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);
    return Promise.resolve(
      new Uint8Array(target.toBuffer('image/jpeg', Math.round(quality * 100))),
    );
  },
};
