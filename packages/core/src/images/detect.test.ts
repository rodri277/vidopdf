import { describe, expect, it } from 'vitest';
import { detectImageKind, isSupportedImage } from './detect';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('detectImageKind', () => {
  it('recognises JPEG, PNG, GIF and WebP by their first bytes', () => {
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(detectImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png');
    expect(detectImageKind(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('gif');
    expect(detectImageKind(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe(
      'webp',
    );
  });

  it('does not take other RIFF files, text or empty data for pictures', () => {
    expect(
      detectImageKind(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)),
    ).toBeUndefined();
    expect(detectImageKind(new TextEncoder().encode('not an image'))).toBeUndefined();
    expect(detectImageKind(new Uint8Array(0))).toBeUndefined();
  });
});

describe('isSupportedImage', () => {
  it('accepts JPEG and PNG only', () => {
    expect(isSupportedImage('jpeg')).toBe(true);
    expect(isSupportedImage('png')).toBe(true);
    expect(isSupportedImage('webp')).toBe(false);
    expect(isSupportedImage('gif')).toBe(false);
    expect(isSupportedImage(undefined)).toBe(false);
  });
});
