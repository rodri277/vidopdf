import type { Raster } from './codec';

/** Samples of 1 (grey) or 3 (RGB) components, 8 bits each, as RGBA. */
export function rasterFromSamples(
  samples: Uint8Array,
  width: number,
  height: number,
  colors: 1 | 3,
): Raster {
  const pixels = width * height;
  const data = new Uint8ClampedArray(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel++) {
    const from = pixel * colors;
    const to = pixel * 4;
    const red = samples[from] ?? 0;
    data[to] = red;
    data[to + 1] = colors === 3 ? (samples[from + 1] ?? 0) : red;
    data[to + 2] = colors === 3 ? (samples[from + 2] ?? 0) : red;
    data[to + 3] = 255;
  }
  return { width, height, data };
}

/** Palettes of this many colours or fewer are diagrams, logos or text, not photographs. */
const LINE_ART_COLORS = 256;
/** Looking at every pixel of a large picture would cost more than the decision is worth. */
const SAMPLE_LIMIT = 200_000;

/** True when a picture uses so few colours that JPEG would blur it for no gain. */
export function looksLikeLineArt(samples: Uint8Array, colors: 1 | 3): boolean {
  const pixels = Math.floor(samples.length / colors);
  const step = Math.max(1, Math.floor(pixels / SAMPLE_LIMIT));
  const seen = new Set<number>();
  for (let pixel = 0; pixel < pixels; pixel += step) {
    const at = pixel * colors;
    seen.add(
      colors === 3
        ? ((samples[at] ?? 0) << 16) | ((samples[at + 1] ?? 0) << 8) | (samples[at + 2] ?? 0)
        : (samples[at] ?? 0),
    );
    if (seen.size > LINE_ART_COLORS) return false;
  }
  return true;
}
