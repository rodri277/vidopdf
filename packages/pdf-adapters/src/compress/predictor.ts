/**
 * Undoes the predictors a Flate stream may have been written with (PDF 32000 §7.4.4.4). pdf-lib
 * inflates Flate streams but ignores /DecodeParms, so without this a picture stored with PNG row
 * filters would be read as garbage. Only 8-bit samples are handled; anything else is refused.
 */
export interface PredictorParams {
  readonly predictor: number;
  readonly colors: number;
  readonly bitsPerComponent: number;
  readonly columns: number;
}

const paeth = (left: number, up: number, upLeft: number): number => {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
};

/** The value each PNG filter type predicts from the neighbours of a byte (type 0 predicts 0). */
const PREDICT: readonly ((left: number, up: number, upLeft: number) => number)[] = [
  () => 0,
  (left) => left,
  (_left, up) => up,
  (left, up) => (left + up) >> 1,
  paeth,
];

function unfilterRow(
  type: number,
  row: Uint8Array,
  previous: Uint8Array,
  bytesPerPixel: number,
): boolean {
  const predict = PREDICT[type];
  if (predict === undefined) return false;
  for (let i = 0; i < row.length; i++) {
    const back = i - bytesPerPixel;
    const left = back >= 0 ? (row[back] ?? 0) : 0;
    const upLeft = back >= 0 ? (previous[back] ?? 0) : 0;
    row[i] = (row[i] ?? 0) + predict(left, previous[i] ?? 0, upLeft);
  }
  return true;
}

/** PNG predictors (10 to 15): every row starts with its own filter type byte. */
function undoPng(data: Uint8Array, rowBytes: number, rows: number, bytesPerPixel: number) {
  if (data.length < rows * (rowBytes + 1)) return undefined;
  const out = new Uint8Array(rows * rowBytes);
  let previous = new Uint8Array(rowBytes);
  for (let y = 0; y < rows; y++) {
    const start = y * (rowBytes + 1);
    const row = out.subarray(y * rowBytes, (y + 1) * rowBytes);
    row.set(data.subarray(start + 1, start + 1 + rowBytes));
    if (!unfilterRow(data[start] ?? 0, row, previous, bytesPerPixel)) return undefined;
    previous = row;
  }
  return out;
}

/** TIFF predictor 2: each sample is stored as the difference from the same component to its left. */
function undoTiff(data: Uint8Array, rowBytes: number, rows: number, colors: number) {
  if (data.length < rows * rowBytes) return undefined;
  const out = data.slice(0, rows * rowBytes);
  for (let y = 0; y < rows; y++) {
    const start = y * rowBytes;
    for (let i = colors; i < rowBytes; i++) {
      out[start + i] = (out[start + i] ?? 0) + (out[start + i - colors] ?? 0);
    }
  }
  return out;
}

/**
 * The plain samples of a picture `width` pixels wide with `colors` components, or undefined when
 * the parameters do not describe it or use something this does not handle.
 */
export function undoPredictor(
  data: Uint8Array,
  params: PredictorParams,
  width: number,
  height: number,
  colors: number,
): Uint8Array | undefined {
  if (params.predictor <= 1) return data;
  if (params.bitsPerComponent !== 8 || params.colors !== colors || params.columns !== width)
    return undefined;
  const rowBytes = width * colors;
  if (params.predictor === 2) return undoTiff(data, rowBytes, height, colors);
  return params.predictor >= 10 ? undoPng(data, rowBytes, height, colors) : undefined;
}
