export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The smallest box holding every pixel that is not (nearly) transparent, or undefined if none. */
export function inkBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Bounds | undefined {
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) < 12) continue;
      [left, top, right, bottom] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
      ];
    }
  }
  return right < left
    ? undefined
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Draws just the ink of a canvas onto a new one, with a little air around it. */
export function trimCanvas(source: HTMLCanvasElement, padding = 6): HTMLCanvasElement | undefined {
  const context = source.getContext('2d');
  if (context === null) return undefined;
  const { data } = context.getImageData(0, 0, source.width, source.height);
  const box = inkBounds(data, source.width, source.height);
  if (box === undefined) return undefined;
  const out = document.createElement('canvas');
  out.width = box.width + padding * 2;
  out.height = box.height + padding * 2;
  out
    .getContext('2d')
    ?.drawImage(
      source,
      box.left,
      box.top,
      box.width,
      box.height,
      padding,
      padding,
      box.width,
      box.height,
    );
  return out;
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob === null ? undefined : new File([blob], name, { type: 'image/png' }));
    }, 'image/png');
  });
}
