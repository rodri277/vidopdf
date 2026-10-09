/** Pixels as 8-bit RGBA, row by row. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * What the compressor needs from the platform to read and write pictures. The browser supplies
 * one built on OffscreenCanvas; tests supply one built on a Node canvas.
 */
export interface ImageCodec {
  decodeJpeg(bytes: Uint8Array): Promise<Raster>;
  /** Resamples `raster` to `width` x `height` (when they differ) and encodes it as a JPEG. */
  encodeJpeg(raster: Raster, width: number, height: number, quality: number): Promise<Uint8Array>;
}
