import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { RenderCanvas } from '../pdfjs-renderer';

/**
 * An OffscreenCanvas stand-in on @napi-rs/canvas, so the renderer's own logic (sizes, white
 * background, encoding) runs in Node. `encodes` lists the MIME types it can produce; asking for
 * another one gives PNG, which is what browsers do too.
 */
export function napiCanvas(encodes: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']) {
  return (width: number, height: number): RenderCanvas => {
    const canvas = createCanvas(width, height);
    const shim = {
      get width() {
        return canvas.width;
      },
      set width(value: number) {
        canvas.width = value;
      },
      get height() {
        return canvas.height;
      },
      set height(value: number) {
        canvas.height = value;
      },
      getContext: (kind: '2d') => canvas.getContext(kind),
      convertToBlob: (options: { type?: string; quality?: number } = {}) => {
        const wanted = options.type ?? 'image/png';
        const type = encodes.includes(wanted) ? wanted : 'image/png';
        const quality = Math.round((options.quality ?? 0.92) * 100);
        const buffer =
          type === 'image/jpeg'
            ? canvas.toBuffer('image/jpeg', quality)
            : type === 'image/webp'
              ? canvas.toBuffer('image/webp', quality)
              : canvas.toBuffer('image/png');
        return Promise.resolve(new Blob([new Uint8Array(buffer)], { type }));
      },
      transferToImageBitmap: (): ImageBitmap => {
        throw new Error('not available outside a browser');
      },
    };
    return shim;
  };
}

export interface Pixels {
  readonly width: number;
  readonly height: number;
  at(x: number, y: number): readonly [number, number, number, number];
}

/** Decodes a PNG, JPEG or WebP so a test can look at its pixels. */
export async function decode(bytes: Uint8Array): Promise<Pixels> {
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  return {
    width: image.width,
    height: image.height,
    at: (x, y) => {
      const offset = (Math.floor(y) * image.width + Math.floor(x)) * 4;
      return [
        data[offset] ?? 0,
        data[offset + 1] ?? 0,
        data[offset + 2] ?? 0,
        data[offset + 3] ?? 0,
      ];
    },
  };
}

type Color = readonly [number, number, number];

/** True when every channel is within `tolerance` of the expected colour. */
export function near(actual: readonly number[], expected: Color, tolerance = 12): boolean {
  return expected.every((value, index) => Math.abs((actual[index] ?? 0) - value) <= tolerance);
}

export const COLORS = {
  red: [220, 30, 30],
  green: [30, 190, 60],
  blue: [40, 60, 230],
  yellow: [240, 220, 30],
} as const satisfies Record<string, Color>;

/** A picture whose four quadrants are red, green, blue and yellow (top-left, top-right, bottom-left, bottom-right). */
export function quadrantImage(width: number, height: number, format: 'png' | 'jpeg'): Uint8Array {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const paint = (color: Color, x: number, y: number) => {
    context.fillStyle = `rgb(${color.join(',')})`;
    context.fillRect(x, y, width / 2, height / 2);
  };
  paint(COLORS.red, 0, 0);
  paint(COLORS.green, width / 2, 0);
  paint(COLORS.blue, 0, height / 2);
  paint(COLORS.yellow, width / 2, height / 2);
  return new Uint8Array(
    format === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 95),
  );
}

/** Inserts an EXIF segment recording `orientation` right after the JPEG start marker. */
export function withOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(26));
  tiff.setUint16(0, 0x4d4d); // big endian
  tiff.setUint16(2, 42);
  tiff.setUint32(4, 8);
  tiff.setUint16(8, 1);
  tiff.setUint16(10, 0x0112);
  tiff.setUint16(12, 3);
  tiff.setUint32(14, 1);
  tiff.setUint16(18, orientation);
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)];
  const length = payload.length + 2;
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    length >> 8,
    length & 0xff,
    ...payload,
    ...jpeg.slice(2),
  ]);
}
