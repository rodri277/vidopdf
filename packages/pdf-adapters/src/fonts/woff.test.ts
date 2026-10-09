import fontkit from '@pdf-lib/fontkit';
import { describe, expect, it } from 'vitest';
import { nodeFonts } from '../testing/fonts';
import { woffToSfnt } from './woff';

describe('woffToSfnt', () => {
  it('gives back a TrueType font that fontkit reads, with the glyphs of the original', async () => {
    const latin = nodeFonts.find((file) => file.script === 'latin' && !file.bold);
    if (latin === undefined) throw new Error('no font');
    const sfnt = woffToSfnt(await latin.load());
    // A plain TrueType font starts with the version 0x00010000, not with "wOFF".
    expect([...sfnt.slice(0, 4)]).toEqual([0, 1, 0, 0]);
    const font = fontkit.create(sfnt) as unknown as {
      hasGlyphForCodePoint(codePoint: number): boolean;
      familyName: string;
    };
    expect(font.familyName).toBe('Inter');
    expect(font.hasGlyphForCodePoint('ñ'.codePointAt(0) ?? 0)).toBe(true);
    expect(font.hasGlyphForCodePoint('Я'.codePointAt(0) ?? 0)).toBe(false);
  });

  it('refuses anything that is not a WOFF 1 file', () => {
    expect(() => woffToSfnt(new Uint8Array(100))).toThrow('Not a WOFF');
    expect(() => woffToSfnt(new Uint8Array([0x77, 0x4f, 0x46, 0x46]))).toThrow('Not a WOFF');
  });
});
