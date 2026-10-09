export type Rotation = 0 | 90 | 180 | 270;

/** A reference to one page of a source file, plus the rotation to apply when exporting. */
export interface PageSelection {
  readonly sourceId: string;
  /** Zero-based index of the page inside its source file. */
  readonly pageIndex: number;
  readonly rotation: Rotation;
}

/** Adds a quarter-turn amount (in degrees, any multiple of 90, negative allowed) to a rotation. */
export function rotate(current: Rotation, degrees: number): Rotation {
  const normalized = (((current + degrees) % 360) + 360) % 360;
  return normalized as Rotation;
}
