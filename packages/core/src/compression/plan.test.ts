import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { acceptable, bitsPerPixel, decideImage, neverLarger } from './plan';
import type { ImageFacts } from './plan';
import { COMPRESSION_PRESETS, settingsFor } from './settings';
import { savedFraction } from './report';

const photo = (changes: Partial<ImageFacts> = {}): ImageFacts => ({
  width: 2480,
  height: 3508,
  source: 'jpeg',
  bytes: 2_500_000,
  effectiveDpi: 300,
  looksLikeLineArt: false,
  ...changes,
});
const balanced = settingsFor('balanced');

describe('settingsFor', () => {
  it('asks for more detail the closer a preset is to print', () => {
    const all = COMPRESSION_PRESETS.map(settingsFor);
    const increasing = (values: readonly number[]) =>
      values.every((value, index) => index === 0 || value > (values[index - 1] ?? Infinity));
    expect(increasing(all.map((settings) => settings.targetDpi))).toBe(true);
    expect(increasing(all.map((settings) => settings.jpegQuality))).toBe(true);
  });
});

describe('decideImage', () => {
  it('shrinks a picture drawn at more dots per inch than the preset wants', () => {
    expect(decideImage(photo(), balanced)).toEqual({
      action: 'recompress',
      width: 1240,
      height: 1754,
      quality: 0.72,
      resize: true,
    });
  });

  it('never makes a picture larger than it is', () => {
    const decision = decideImage(photo({ effectiveDpi: 90 }), balanced);
    expect(decision).toMatchObject({ resize: false, width: 2480, height: 3508 });
  });

  it('leaves a picture alone when its placement is unknown, or it is tiny', () => {
    expect(decideImage(photo({ effectiveDpi: undefined }), balanced)).toEqual({
      action: 'keep',
      reason: 'unknownPlacement',
    });
    expect(decideImage(photo({ effectiveDpi: 0 }), balanced)).toEqual({
      action: 'keep',
      reason: 'unknownPlacement',
    });
    expect(decideImage(photo({ width: 40, height: 40 }), balanced)).toEqual({
      action: 'keep',
      reason: 'tiny',
    });
  });

  it('leaves line art stored without loss alone, but encodes a lossless photograph', () => {
    expect(decideImage(photo({ source: 'flate', looksLikeLineArt: true }), balanced)).toEqual({
      action: 'keep',
      reason: 'lineArt',
    });
    expect(decideImage(photo({ source: 'flate', bytes: 30_000_000 }), balanced).action).toBe(
      'recompress',
    );
  });

  it('leaves a JPEG that is already thin and needs no resizing', () => {
    const thin = photo({ effectiveDpi: 140, bytes: 100_000 });
    expect(bitsPerPixel(thin)).toBeLessThan(1.2);
    expect(decideImage(thin, balanced)).toEqual({ action: 'keep', reason: 'alreadySmall' });
  });

  it('still shrinks a thin JPEG that is drawn far too sharp', () => {
    expect(decideImage(photo({ effectiveDpi: 600, bytes: 100_000 }), balanced).action).toBe(
      'recompress',
    );
  });

  it('ignores a resize that would gain almost nothing', () => {
    const decision = decideImage(photo({ effectiveDpi: 155 }), balanced);
    expect(decision).toMatchObject({ action: 'recompress', resize: false });
  });

  it('a sharper preset keeps more pixels, for any picture', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 6000 }),
        fc.integer({ min: 100, max: 6000 }),
        fc.integer({ min: 40, max: 1200 }),
        (w, h, dpi) => {
          const facts = photo({ width: w, height: h, effectiveDpi: dpi, bytes: w * h });
          const screen = decideImage(facts, settingsFor('screen'));
          const print = decideImage(facts, settingsFor('print'));
          if (screen.action === 'recompress' && print.action === 'recompress') {
            expect(print.width).toBeGreaterThanOrEqual(screen.width);
            expect(print.height).toBeGreaterThanOrEqual(screen.height);
          }
        },
      ),
    );
  });

  it('keeps the aspect ratio within a pixel and never asks for an empty picture', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 64, max: 8000 }),
        fc.integer({ min: 64, max: 8000 }),
        fc.integer({ min: 40, max: 3000 }),
        (w, h, dpi) => {
          const decision = decideImage(
            photo({ width: w, height: h, effectiveDpi: dpi, bytes: w * h }),
            balanced,
          );
          if (decision.action !== 'recompress') return;
          expect(decision.width).toBeGreaterThanOrEqual(1);
          expect(decision.height).toBeGreaterThanOrEqual(1);
          expect(decision.width).toBeLessThanOrEqual(w);
          // Each side is rounded to a whole pixel, which can move it by half a pixel.
          const relative = Math.abs(decision.width / decision.height - w / h) / (w / h);
          expect(relative).toBeLessThanOrEqual(0.5 / decision.width + 0.5 / decision.height + 1e-9);
        },
      ),
    );
  });
});

describe('acceptable and neverLarger', () => {
  it('takes a new encoding only if it saves a tenth', () => {
    expect(acceptable(1000, 900)).toBe(true);
    expect(acceptable(1000, 901)).toBe(false);
    expect(acceptable(1000, 1500)).toBe(false);
  });

  it('hands back the original when the candidate is not smaller', () => {
    const original = new Uint8Array(10);
    expect(neverLarger(original, new Uint8Array(11))).toBe(original);
    expect(neverLarger(original, new Uint8Array(10))).toBe(original);
    const smaller = new Uint8Array(9);
    expect(neverLarger(original, smaller)).toBe(smaller);
  });
});

describe('savedFraction', () => {
  it('is the share of the file that went away, never negative', () => {
    expect(savedFraction({ bytesBefore: 1000, bytesAfter: 400 })).toBe(0.6);
    expect(savedFraction({ bytesBefore: 1000, bytesAfter: 1200 })).toBe(0);
    expect(savedFraction({ bytesBefore: 0, bytesAfter: 0 })).toBe(0);
  });
});
