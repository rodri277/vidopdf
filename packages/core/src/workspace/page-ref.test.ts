import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blank, original } from '../test-helpers';
import { renderKey, rotate, toExportPage } from './page-ref';
import type { Rotation } from './page-ref';

const rotations: readonly Rotation[] = [0, 90, 180, 270];
const rotationArb = fc.constantFrom(...rotations);
const quarterTurns = fc.integer({ min: -40, max: 40 }).map((n) => n * 90);

describe('rotate', () => {
  it('turns clockwise and wraps around', () => {
    expect(rotate(270, 90)).toBe(0);
  });

  it('turns counter-clockwise and wraps around', () => {
    expect(rotate(0, -90)).toBe(270);
  });

  it('always yields a valid rotation', () => {
    fc.assert(
      fc.property(rotationArb, quarterTurns, (r, d) => {
        expect(rotations).toContain(rotate(r, d));
      }),
    );
  });

  it('is undone by the opposite turn', () => {
    fc.assert(
      fc.property(rotationArb, quarterTurns, (r, d) => {
        expect(rotate(rotate(r, d), -d)).toBe(r);
      }),
    );
  });
});

describe('toExportPage and renderKey', () => {
  it('drops ids and keeps what the writer needs', () => {
    expect(toExportPage({ ...original('x', 'f', 4), rotation: 90 })).toEqual({
      kind: 'original',
      sourceId: 'f',
      pageIndex: 4,
      rotation: 90,
    });
    expect(toExportPage(blank('b'))).toEqual({
      kind: 'blank',
      width: 595,
      height: 842,
      rotation: 0,
    });
  });

  it('gives duplicates the same render key and ignores rotation', () => {
    expect(renderKey(original('a', 'f', 2))).toBe(
      renderKey({ ...original('b', 'f', 2), rotation: 180 }),
    );
    expect(renderKey(blank('b'))).toBe('blank');
  });
});
