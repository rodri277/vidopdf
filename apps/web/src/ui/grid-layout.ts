/**
 * Geometry of the page grid. Every cell has the same size, so the position of any page follows
 * from arithmetic and the grid can be virtualized, selected with a rubber band and used as a drop
 * target without measuring the DOM.
 */
export interface GridMetrics {
  readonly count: number;
  readonly columns: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly gap: number;
  /** Left edge of the first column (the grid is centred in the space it has). */
  readonly offsetX: number;
  readonly paddingY: number;
  readonly rows: number;
  readonly rowPitch: number;
  readonly contentHeight: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Room for the page number under the thumbnail. */
const LABEL_HEIGHT = 28;
/** Tall enough for an A4 portrait page (1.414) with a little to spare. */
const PAGE_ASPECT = 1.42;

export function gridMetrics(
  count: number,
  containerWidth: number,
  cellWidth: number,
  gap = 16,
  paddingX = 24,
  paddingY = 24,
): GridMetrics {
  const usable = Math.max(cellWidth, containerWidth - 2 * paddingX);
  const columns = Math.max(1, Math.floor((usable + gap) / (cellWidth + gap)));
  const used = columns * cellWidth + (columns - 1) * gap;
  const offsetX = paddingX + Math.max(0, (usable - used) / 2);
  const cellHeight = Math.round(cellWidth * PAGE_ASPECT) + LABEL_HEIGHT;
  const rows = Math.ceil(count / columns);
  const rowPitch = cellHeight + gap;
  const contentHeight = rows === 0 ? 0 : 2 * paddingY + rows * rowPitch - gap;
  return {
    count,
    columns,
    cellWidth,
    cellHeight,
    gap,
    offsetX,
    paddingY,
    rows,
    rowPitch,
    contentHeight,
  };
}

export function cellRect(metrics: GridMetrics, index: number): Rect {
  const row = Math.floor(index / metrics.columns);
  const column = index % metrics.columns;
  return {
    x: metrics.offsetX + column * (metrics.cellWidth + metrics.gap),
    y: metrics.paddingY + row * metrics.rowPitch,
    width: metrics.cellWidth,
    height: metrics.cellHeight,
  };
}

/** Indices of the cells a rectangle (in content coordinates) touches. */
export function indicesInRect(metrics: GridMetrics, rect: Rect): number[] {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const result: number[] = [];
  const firstRow = Math.max(0, Math.floor((top - metrics.paddingY) / metrics.rowPitch));
  const lastRow = Math.min(
    metrics.rows - 1,
    Math.floor((bottom - metrics.paddingY) / metrics.rowPitch),
  );
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = 0; column < metrics.columns; column++) {
      const index = row * metrics.columns + column;
      if (index >= metrics.count) break;
      const cell = cellRect(metrics, index);
      const overlaps =
        cell.x < right &&
        cell.x + cell.width > left &&
        cell.y < bottom &&
        cell.y + cell.height > top;
      if (overlaps) result.push(index);
    }
  }
  return result;
}

export interface Gap {
  /** Insertion index in the page list, 0 (before the first page) to count (after the last). */
  readonly index: number;
  /** Where to draw the insertion line: a row, and a column from 0 (left of the first cell) to `columns`. */
  readonly row: number;
  readonly column: number;
}

/**
 * The gap closest to a point (content coordinates): the place a dragged page would be inserted.
 * The left half of a cell means "before it", the right half "after it".
 */
export function gapAt(metrics: GridMetrics, x: number, y: number): Gap {
  if (metrics.count === 0) return { index: 0, row: 0, column: 0 };
  const row = Math.min(
    metrics.rows - 1,
    Math.max(0, Math.floor((y - metrics.paddingY) / metrics.rowPitch)),
  );
  const pitch = metrics.cellWidth + metrics.gap;
  const wanted = Math.floor((x - metrics.offsetX) / pitch + 0.5);
  const inRow = Math.min(metrics.columns, metrics.count - row * metrics.columns);
  const column = Math.min(inRow, Math.max(0, wanted));
  return { index: row * metrics.columns + column, row, column };
}

export interface VisibleRange {
  readonly first: number;
  readonly last: number;
}

/** Indices of the pages in view, widened by `overscanRows` rows on each side. */
export function visibleRange(
  metrics: GridMetrics,
  scrollTop: number,
  viewportHeight: number,
  overscanRows = 1,
): VisibleRange {
  if (metrics.count === 0) return { first: 0, last: -1 };
  const firstRow = Math.max(
    0,
    Math.floor((scrollTop - metrics.paddingY) / metrics.rowPitch) - overscanRows,
  );
  const lastRow = Math.min(
    metrics.rows - 1,
    Math.floor((scrollTop + viewportHeight - metrics.paddingY) / metrics.rowPitch) + overscanRows,
  );
  return {
    first: firstRow * metrics.columns,
    last: Math.min(metrics.count - 1, (lastRow + 1) * metrics.columns - 1),
  };
}
