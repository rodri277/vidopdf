import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatLength, fromPoints, toPoints } from './units';

describe('lengths', () => {
  it('knows the sizes of well known paper', () => {
    expect(Math.round(toPoints(210, 'mm'))).toBe(595);
    expect(Math.round(toPoints(297, 'mm'))).toBe(842);
    expect(toPoints(8.5, 'in')).toBe(612);
    expect(Math.round(toPoints(21, 'cm'))).toBe(595);
  });

  it('converts there and back', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 5000, noNaN: true }),
        fc.constantFrom('mm', 'cm', 'in' as const),
        (value, unit) => {
          expect(fromPoints(toPoints(value, unit), unit)).toBeCloseTo(value, 6);
        },
      ),
    );
  });

  it('shows a length without noise: whole when it is nearly whole, no trailing zeros', () => {
    expect(formatLength(595, 'mm')).toBe('210'); // A4 as PDF rounds it: 209.9 mm
    expect(formatLength(842, 'mm')).toBe('297');
    expect(formatLength(toPoints(150.5, 'mm'), 'mm')).toBe('150.5');
    expect(formatLength(595.28, 'cm')).toBe('21');
    expect(formatLength(612, 'in')).toBe('8.5');
    expect(formatLength(595, 'in')).toBe('8.26');
  });
});
