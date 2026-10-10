import { detectImageKind } from './detect';
import { jpegOrientation, swapsAxes } from './orientation';

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** How much of a file is enough to find its size: JPEG puts it after the metadata. */
export const SIZE_PROBE_BYTES = 256 * 1024;

function pngSize(bytes: Uint8Array): ImageSize | undefined {
  // Signature (8), then the IHDR chunk: length (4), "IHDR" (4), width (4), height (4).
  if (bytes.length < 24) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isHeader = view.getUint32(12) === 0x49484452;
  return isHeader ? { width: view.getUint32(16), height: view.getUint32(20) } : undefined;
}

/** Start-of-frame markers carry the size; C4, C8 and CC share the range but are something else. */
const isFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(bytes: Uint8Array): ImageSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1; // padding
      continue;
    }
    if (isFrame(marker)) {
      return at + 9 <= bytes.length
        ? { height: view.getUint16(at + 5), width: view.getUint16(at + 7) }
        : undefined;
    }
    at += 2 + view.getUint16(at + 2);
  }
  return undefined;
}

/** The pixels of a JPEG or PNG as stored, read from its header alone (nothing is decoded). */
export function storedImageSize(bytes: Uint8Array): ImageSize | undefined {
  const kind = detectImageKind(bytes);
  const size = kind === 'png' ? pngSize(bytes) : kind === 'jpeg' ? jpegSize(bytes) : undefined;
  return size !== undefined && size.width > 0 && size.height > 0 ? size : undefined;
}

/** The size as the picture is seen: a phone photo stored sideways has its sides swapped. */
export function shownImageSize(bytes: Uint8Array): ImageSize | undefined {
  const size = storedImageSize(bytes);
  if (size === undefined) return undefined;
  const turned = detectImageKind(bytes) === 'jpeg' && swapsAxes(jpegOrientation(bytes));
  return turned ? { width: size.height, height: size.width } : size;
}
