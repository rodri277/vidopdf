import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { jpegOrientation, orientationMatrix, swapsAxes } from './orientation';
import type { ExifOrientation } from './orientation';

/** A minimal JPEG: start of image, one EXIF segment holding the orientation, then image data. */
export function jpegWithOrientation(orientation: number, littleEndian = true): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(26));
  tiff.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, littleEndian);
  tiff.setUint32(4, 8, littleEndian);
  tiff.setUint16(8, 1, littleEndian); // one directory entry
  tiff.setUint16(10, 0x0112, littleEndian);
  tiff.setUint16(12, 3, littleEndian); // SHORT
  tiff.setUint32(14, 1, littleEndian);
  tiff.setUint16(18, orientation, littleEndian);
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)];
  const length = exif.length + 2;
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    length >> 8,
    length & 0xff,
    ...exif,
    0xff,
    0xda,
    0,
    2,
    0xff,
    0xd9,
  ]);
}

describe('jpegOrientation', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('reads orientation %i in both byte orders', (value) => {
    expect(jpegOrientation(jpegWithOrientation(value, true))).toBe(value);
    expect(jpegOrientation(jpegWithOrientation(value, false))).toBe(value);
  });

  it('treats a picture without EXIF, a non-JPEG and garbage as upright', () => {
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(jpegOrientation(new Uint8Array(0))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8]))).toBe(1);
  });

  it('ignores an orientation value outside 1 to 8', () => {
    expect(jpegOrientation(jpegWithOrientation(0))).toBe(1);
    expect(jpegOrientation(jpegWithOrientation(9))).toBe(1);
  });

  it('survives truncated or corrupted EXIF data without throwing', () => {
    const good = jpegWithOrientation(6);
    for (let cut = 0; cut < good.length; cut++) {
      expect(() => jpegOrientation(good.slice(0, cut))).not.toThrow();
    }
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 80 }), (junk) => {
        expect([1, 2, 3, 4, 5, 6, 7, 8]).toContain(jpegOrientation(junk));
      }),
    );
  });

  it('skips other segments before the EXIF one', () => {
    const exif = jpegWithOrientation(8).slice(2);
    const withApp0 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, ...exif]);
    expect(jpegOrientation(withApp0)).toBe(8);
  });
});

describe('swapsAxes', () => {
  it('is true only for the quarter turns and transposes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((o) => swapsAxes(o as ExifOrientation))).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('orientationMatrix', () => {
  const placement = { pageWidth: 600, pageHeight: 800, x: 100, y: 200, width: 300, height: 400 };
  const apply = (m: readonly number[], u: number, v: number) => [
    (m[0] ?? 0) * u + (m[2] ?? 0) * v + (m[4] ?? 0),
    (m[1] ?? 0) * u + (m[3] ?? 0) * v + (m[5] ?? 0),
  ];

  it('is the plain placement for an upright picture', () => {
    expect(orientationMatrix(1, placement)).toEqual([300, 0, 0, 400, 100, 200]);
  });

  it('puts the top of a picture stored for orientation 6 on the right, and for 8 on the left', () => {
    // Stored top-left corner is (u, v) = (0, 1).
    expect(apply(orientationMatrix(6, placement), 0, 1)).toEqual([400, 600]); // top-right of the rect
    expect(apply(orientationMatrix(8, placement), 0, 1)).toEqual([100, 200]); // bottom-left of the rect
  });

  it('turns an orientation 3 picture half a turn', () => {
    expect(apply(orientationMatrix(3, placement), 0, 0)).toEqual([400, 600]);
    expect(apply(orientationMatrix(3, placement), 1, 1)).toEqual([100, 200]);
  });

  it('mirrors for 2 and 4', () => {
    expect(apply(orientationMatrix(2, placement), 0, 0)).toEqual([400, 200]);
    expect(apply(orientationMatrix(4, placement), 0, 0)).toEqual([100, 600]);
  });

  it('always lands the four corners exactly on the corners of the placement', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (value) => {
        const m = orientationMatrix(value as ExifOrientation, placement);
        const corners = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([u, v]) => apply(m, u ?? 0, v ?? 0).join());
        const rect = [
          [100, 200],
          [400, 200],
          [100, 600],
          [400, 600],
        ].map((c) => c.join());
        expect(new Set(corners)).toEqual(new Set(rect));
      }),
    );
  });

  it('is a proper rotation or a mirror: the determinant is plus or minus width times height', () => {
    for (const value of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const [a, b, c, d] = orientationMatrix(value, placement);
      expect(Math.abs(a * d - b * c)).toBe(300 * 400);
    }
  });
});
