/** Lengths the user can type for a page. PDF counts in points: 72 to the inch. */
export type LengthUnit = 'mm' | 'cm' | 'in';

export const LENGTH_UNITS: readonly LengthUnit[] = ['mm', 'cm', 'in'];

const POINTS_PER_UNIT: Record<LengthUnit, number> = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72 };

export function toPoints(value: number, unit: LengthUnit): number {
  return value * POINTS_PER_UNIT[unit];
}

export function fromPoints(points: number, unit: LengthUnit): number {
  return points / POINTS_PER_UNIT[unit];
}

const DECIMALS: Record<LengthUnit, number> = { mm: 1, cm: 2, in: 2 };
/** Within this of a whole number it is shown whole: A4 is 595 points, which is 209.9 mm, not 210. */
const SNAP: Record<LengthUnit, number> = { mm: 0.15, cm: 0.015, in: 0.006 };

/** A length for people, with as many decimals as the unit needs and no trailing zeros. */
export function formatLength(points: number, unit: LengthUnit): string {
  const value = fromPoints(points, unit);
  const whole = Math.round(value);
  const snapped = Math.abs(value - whole) < SNAP[unit] ? whole : value;
  return String(Number(snapped.toFixed(DECIMALS[unit])));
}
