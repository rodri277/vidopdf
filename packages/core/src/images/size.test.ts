import { describe, expect, it } from 'vitest';
import { jpegWithOrientation } from './orientation.test';
import { shownImageSize, storedImageSize } from './size';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A JPEG with some metadata in front and then a baseline frame header. */
function jpeg(width: number, height: number, before: Uint8Array = new Uint8Array()): Uint8Array {
  const frame = new Uint8Array(19);
  frame.set([0xff, 0xc0, 0, 17, 8]);
  const view = new DataView(frame.buffer);
  view.setUint16(5, height);
  view.setUint16(7, width);
  frame.set([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 9);
  return new Uint8Array([0xff, 0xd8, ...before, ...frame, 0xff, 0xd9]);
}

describe('the size of a picture, from its header', () => {
  it('reads a PNG', () => {
    expect(storedImageSize(png(4000, 3000))).toEqual({ width: 4000, height: 3000 });
  });

  it('reads a JPEG, also after other segments, and does not mistake a table for the frame', () => {
    const table = new Uint8Array([0xff, 0xc4, 0, 4, 0, 0]); // define Huffman table
    const comment = new Uint8Array([0xff, 0xfe, 0, 5, 1, 2, 3]);
    expect(storedImageSize(jpeg(640, 480, new Uint8Array([...comment, ...table])))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('says nothing for what is not a picture, is cut short or has no size', () => {
    expect(storedImageSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(storedImageSize(png(1, 1).slice(0, 20))).toBeUndefined();
    expect(storedImageSize(png(0, 5))).toBeUndefined();
    expect(storedImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeUndefined();
    expect(storedImageSize(jpeg(10, 10).slice(0, 8))).toBeUndefined();
  });

  it('swaps the sides of a photo that is stored sideways', () => {
    const sideways = jpegWithOrientation(6);
    const upright = jpegWithOrientation(1);
    // Those helpers carry no frame header: give them one after the EXIF segment.
    const withFrame = (head: Uint8Array) =>
      new Uint8Array([...head.slice(0, head.length - 6), ...jpeg(300, 200).slice(2)]);
    expect(shownImageSize(withFrame(sideways))).toEqual({ width: 200, height: 300 });
    expect(shownImageSize(withFrame(upright))).toEqual({ width: 300, height: 200 });
  });
});
