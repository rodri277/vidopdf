import type { CompressionSettings } from './settings';

/** What is known about one picture inside a PDF before deciding what to do with it. */
export interface ImageFacts {
  /** Pixels. */
  readonly width: number;
  readonly height: number;
  /** How it is stored: a JPEG stream, or raw samples compressed with Flate (lossless). */
  readonly source: 'jpeg' | 'flate';
  /** Size of the stream as stored, in bytes. */
  readonly bytes: number;
  /**
   * Resolution it is drawn at, in dots per inch, taken from the largest place it appears on a
   * page. Undefined when no page was found to draw it (then it is left alone).
   */
  readonly effectiveDpi: number | undefined;
  /** Flate pictures with few colours (diagrams, logos, text) are ruined by JPEG. */
  readonly looksLikeLineArt: boolean;
}

export type ImageDecision =
  | { readonly action: 'keep'; readonly reason: KeepReason }
  | {
      readonly action: 'recompress';
      readonly width: number;
      readonly height: number;
      readonly quality: number;
      /** Smaller dimensions than stored, so the picture is also resampled. */
      readonly resize: boolean;
    };

export type KeepReason = 'unknownPlacement' | 'lineArt' | 'alreadySmall' | 'tiny' | 'tooLarge';

/** Pictures this small are not worth the work. */
const MIN_PIXELS = 4096;
/**
 * Pictures above this are not decoded at all: 40 megapixels is 160 MB of RGBA before any copy,
 * enough to take a worker down on a modest machine.
 */
export const MAX_DECODED_PIXELS = 40_000_000;
/** A resize smaller than this fraction is not worth losing quality twice for. */
const RESIZE_THRESHOLD = 0.95;
/** A JPEG that already uses fewer bits per pixel than this will not shrink usefully. */
const JPEG_BITS_PER_PIXEL_FLOOR = 1.2;

/** Bits the stored picture spends per pixel. */
export function bitsPerPixel(facts: Pick<ImageFacts, 'bytes' | 'width' | 'height'>): number {
  return (facts.bytes * 8) / Math.max(1, facts.width * facts.height);
}

/**
 * Decides what to do with a picture. A picture is shrunk when it is drawn at more dots per inch
 * than the preset wants, and encoded again as a JPEG when that is likely to save space. The
 * actual result is checked afterwards (`acceptable`): this only chooses what is worth trying.
 */
export function decideImage(facts: ImageFacts, settings: CompressionSettings): ImageDecision {
  const kept = reasonToKeep(facts);
  if (kept !== undefined) return { action: 'keep', reason: kept };
  const dpi = facts.effectiveDpi ?? 0;
  const scale = Math.min(1, settings.targetDpi / dpi);
  const resize = scale < RESIZE_THRESHOLD;
  if (!resize && facts.source === 'jpeg' && bitsPerPixel(facts) < JPEG_BITS_PER_PIXEL_FLOOR) {
    return { action: 'keep', reason: 'alreadySmall' };
  }
  const shrink = (pixels: number) => (resize ? Math.max(1, Math.round(pixels * scale)) : pixels);
  return {
    action: 'recompress',
    width: shrink(facts.width),
    height: shrink(facts.height),
    quality: settings.jpegQuality,
    resize,
  };
}

/** Pictures that are never touched, whatever the preset. */
function reasonToKeep(facts: ImageFacts): KeepReason | undefined {
  if (facts.width * facts.height < MIN_PIXELS) return 'tiny';
  if (facts.width * facts.height > MAX_DECODED_PIXELS) return 'tooLarge';
  if (facts.effectiveDpi === undefined || facts.effectiveDpi <= 0) return 'unknownPlacement';
  return facts.source === 'flate' && facts.looksLikeLineArt ? 'lineArt' : undefined;
}

/** A new encoding replaces the old one only if it saves at least a tenth; otherwise it is not worth the risk. */
export function acceptable(oldBytes: number, newBytes: number): boolean {
  return newBytes <= oldBytes * 0.9;
}

/**
 * The file to hand back: the compressed one only if it really is smaller than the original.
 * A compressor must never make a file bigger.
 */
export function neverLarger<T extends { readonly byteLength: number }>(
  original: T,
  candidate: T,
): T {
  return candidate.byteLength < original.byteLength ? candidate : original;
}
