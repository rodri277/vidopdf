import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ALL_ALLOWED,
  decodePermissions,
  encodePermissions,
  intersectPermissions,
  isRestricted,
} from './permissions';
import type { Permissions } from './permissions';

const permissions = fc.record<Permissions>({
  print: fc.constantFrom('none', 'low', 'high'),
  modify: fc.boolean(),
  copy: fc.boolean(),
  annotate: fc.boolean(),
  fillForms: fc.boolean(),
  accessibility: fc.boolean(),
  assemble: fc.boolean(),
});

describe('permissions as the /P value', () => {
  it('reads the value of a real owner-restricted file: everything denied', () => {
    // qpdf --show-encryption of tests/fixtures/generated/encrypted-owner-restricted.pdf
    const decoded = decodePermissions(-3904);
    expect(decoded).toEqual({
      print: 'none',
      modify: false,
      copy: false,
      annotate: false,
      fillForms: false,
      accessibility: false,
      assemble: false,
    });
    expect(isRestricted(decoded)).toBe(true);
    expect(encodePermissions(decoded)).toBe(-3904);
  });

  it('writes the usual value for a file with nothing taken away', () => {
    expect(encodePermissions(ALL_ALLOWED)).toBe(-4);
    expect(isRestricted(decodePermissions(-4))).toBe(false);
  });

  it('decoding what was encoded gives the same permissions', () => {
    fc.assert(
      fc.property(permissions, (original) => {
        expect(decodePermissions(encodePermissions(original))).toEqual(original);
      }),
    );
  });

  it('low-resolution printing is printing without the high-quality bit', () => {
    expect(decodePermissions(encodePermissions({ ...ALL_ALLOWED, print: 'low' })).print).toBe(
      'low',
    );
  });
});

describe('intersectPermissions', () => {
  it('allows nothing that any of the files denies', () => {
    fc.assert(
      fc.property(fc.array(permissions, { minLength: 1, maxLength: 4 }), (list) => {
        const merged = intersectPermissions(list);
        for (const key of [
          'modify',
          'copy',
          'annotate',
          'fillForms',
          'accessibility',
          'assemble',
        ] as const) {
          expect(merged[key]).toBe(list.every((entry) => entry[key]));
        }
        const rank = { none: 0, low: 1, high: 2 };
        expect(rank[merged.print]).toBe(Math.min(...list.map((entry) => rank[entry.print])));
      }),
    );
  });

  it('is open when there is nothing to combine', () => {
    expect(intersectPermissions([])).toEqual(ALL_ALLOWED);
  });
});
