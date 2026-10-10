import type { Margins } from './crop';
import { NO_MARGINS, normalizeCrop } from './crop';

/**
 * Finds the margins of empty paper around the content of a page picture (RGBA, as a canvas gives
 * it): a pixel counts as content when it is darker than `threshold` in any colour channel.
 * `padding` keeps a little air around the content, as a fraction of the page. A blank page, or one
 * that is all content, gives no crop.
 */
export function detectMargins(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: { threshold?: number; padding?: number } = {},
): Margins {
  const found = contentBox(rgba, width, height, options.threshold ?? 240);
  if (found === undefined) return NO_MARGINS;
  const padding = options.padding ?? 0.01;
  return normalizeCrop({
    left: Math.max(0, found.left / width - padding),
    right: Math.max(0, 1 - (found.right + 1) / width - padding),
    top: Math.max(0, found.top / height - padding),
    bottom: Math.max(0, 1 - (found.bottom + 1) / height - padding),
  });
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Whether the pixel at `at` is content: opaque and darker than the threshold in some channel. */
function isContent(rgba: Uint8ClampedArray, at: number, threshold: number): boolean {
  if ((rgba[at + 3] ?? 255) < 16) return false;
  return (
    (rgba[at] ?? 255) < threshold ||
    (rgba[at + 1] ?? 255) < threshold ||
    (rgba[at + 2] ?? 255) < threshold
  );
}

/** The smallest box holding every content pixel, or undefined for a blank picture. */
function contentBox(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): Box | undefined {
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isContent(rgba, (y * width + x) * 4, threshold)) continue;
      [left, top, right, bottom] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
      ];
    }
  }
  return right < left ? undefined : { left, top, right, bottom };
}
