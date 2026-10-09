export type Rotation = 0 | 90 | 180 | 270;

/** A page that comes from a loaded file. `sourceIndex` is zero-based inside that file. */
export interface OriginalPage {
  readonly kind: 'original';
  readonly id: string;
  readonly sourceId: string;
  readonly sourceIndex: number;
  readonly rotation: Rotation;
}

/** A blank page inserted by the user. Size is in PDF points (1/72 inch). */
export interface BlankPage {
  readonly kind: 'blank';
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
}

/**
 * What the grid orders. The id is stable: selection and thumbnails survive reordering, and a
 * duplicate gets a new id while sharing the render cache of the page it copies.
 */
export type PageRef = OriginalPage | BlankPage;

/** A page as the writer receives it: no ids, just what is needed to build the output. */
export type ExportPage =
  | {
      readonly kind: 'original';
      readonly sourceId: string;
      readonly pageIndex: number;
      readonly rotation: Rotation;
    }
  | {
      readonly kind: 'blank';
      readonly width: number;
      readonly height: number;
      readonly rotation: Rotation;
    };

/** Adds a quarter-turn amount (in degrees, any multiple of 90, negative allowed) to a rotation. */
export function rotate(current: Rotation, degrees: number): Rotation {
  const normalized = (((current + degrees) % 360) + 360) % 360;
  return normalized as Rotation;
}

export function toExportPage(page: PageRef): ExportPage {
  return page.kind === 'original'
    ? {
        kind: 'original',
        sourceId: page.sourceId,
        pageIndex: page.sourceIndex,
        rotation: page.rotation,
      }
    : { kind: 'blank', width: page.width, height: page.height, rotation: page.rotation };
}

/** Key of the render cache entry for a page: duplicates share it, rotation is applied by CSS. */
export function renderKey(page: PageRef): string {
  return page.kind === 'original' ? `${page.sourceId}:${String(page.sourceIndex)}` : 'blank';
}
