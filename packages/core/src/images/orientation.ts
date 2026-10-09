import type { ImagePlacement } from './layout';

/** EXIF orientation: how the stored pixels must be turned to show the picture upright. */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const SOI = 0xffd8;
const APP1 = 0xffe1;
const EXIF_MAGIC = 0x45786966; // "Exif"
const ORIENTATION_TAG = 0x0112;
const TYPE_SHORT = 3;
const START_OF_SCAN = 0xffda;

/** Byte order of the TIFF header at `start` (true for little endian), or undefined when it is not one. */
function tiffByteOrder(view: DataView, start: number): boolean | undefined {
  if (start + 8 > view.byteLength) return undefined;
  const mark = view.getUint16(start);
  const little = mark === 0x4949;
  return (little || mark === 0x4d4d) && view.getUint16(start + 2, little) === 42
    ? little
    : undefined;
}

function orientationFromEntry(
  view: DataView,
  entry: number,
  little: boolean,
): ExifOrientation | undefined {
  const value = view.getUint16(entry + 8, little);
  const valid = view.getUint16(entry + 2, little) === TYPE_SHORT && value >= 1 && value <= 8;
  return valid ? (value as ExifOrientation) : undefined;
}

function readExifOrientation(view: DataView, start: number): ExifOrientation | undefined {
  // `start` points at the TIFF header: byte order, 42, offset of the first directory.
  const little = tiffByteOrder(view, start);
  if (little === undefined) return undefined;
  const directory = start + view.getUint32(start + 4, little);
  if (directory + 2 > view.byteLength) return undefined;
  for (let index = 0, count = view.getUint16(directory, little); index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > view.byteLength) return undefined;
    if (view.getUint16(entry, little) === ORIENTATION_TAG)
      return orientationFromEntry(view, entry, little);
  }
  return undefined;
}

/** Where the TIFF block of the EXIF segment starts, walking the JPEG segments from the top. */
function findExif(view: DataView): number | undefined {
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    // Image data starts, or this is not a segment: no EXIF can follow.
    if (marker === START_OF_SCAN || (marker & 0xff00) !== 0xff00) return undefined;
    const length = view.getUint16(offset + 2);
    const isExif = marker === APP1 && length >= 8 && offset + 10 <= view.byteLength;
    if (isExif && view.getUint32(offset + 4) === EXIF_MAGIC) return offset + 10;
    offset += 2 + length;
  }
  return undefined;
}

/** The orientation recorded in a JPEG's EXIF data, or 1 (upright) when there is none or it is unreadable. */
export function jpegOrientation(bytes: Uint8Array): ExifOrientation {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return 1;
  const start = findExif(view);
  return (start === undefined ? undefined : readExifOrientation(view, start)) ?? 1;
}

/** Orientations 5 to 8 turn the picture a quarter, so its width and height trade places. */
export function swapsAxes(orientation: ExifOrientation): boolean {
  return orientation >= 5;
}

/** Stored (u right, v up) to displayed (s right, t up), as `s = su*u + sv*v + s0` and the same for t. */
const COEFFICIENTS: Record<
  ExifOrientation,
  readonly [number, number, number, number, number, number]
> = {
  1: [1, 0, 0, 0, 1, 0],
  2: [-1, 0, 1, 0, 1, 0],
  3: [-1, 0, 1, 0, -1, 1],
  4: [1, 0, 0, 0, -1, 1],
  5: [0, -1, 1, -1, 0, 1],
  6: [0, 1, 0, -1, 0, 1],
  7: [0, 1, 0, 1, 0, 0],
  8: [0, -1, 1, 1, 0, 0],
};

export type Matrix = readonly [number, number, number, number, number, number];

/**
 * The PDF transformation matrix [a b c d e f] that draws a picture's unit square so that it shows
 * upright inside `placement` (which describes the picture as displayed, after turning).
 */
export function orientationMatrix(orientation: ExifOrientation, placement: ImagePlacement): Matrix {
  const [su, sv, s0, tu, tv, t0] = COEFFICIENTS[orientation];
  const { x, y, width, height } = placement;
  return [width * su, height * tu, width * sv, height * tv, x + width * s0, y + height * t0];
}
