import { describe, expect, it } from 'vitest';
import { classifyFile } from './classify';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

describe('classifyFile', () => {
  it('knows a PDF by its header, whatever the name says', () => {
    expect(classifyFile(text('%PDF-1.7\n...'), 'scan.jpg', 'image/jpeg')).toEqual({ kind: 'pdf' });
    expect(classifyFile(text('\n\n  junk before\n%PDF-1.4'), 'x', '')).toEqual({ kind: 'pdf' });
  });

  it('sends a file that claims to be a PDF but is not to the PDF path, so the error says it is damaged', () => {
    expect(classifyFile(text('hello'), 'report.PDF', '')).toEqual({ kind: 'pdf' });
    expect(classifyFile(new Uint8Array(0), 'empty', 'application/pdf')).toEqual({ kind: 'pdf' });
  });

  it('accepts JPEG and PNG by their bytes, even with the wrong name', () => {
    expect(classifyFile(jpeg, 'photo.pdf', 'application/pdf')).toEqual({
      kind: 'image',
      format: 'jpeg',
    });
    expect(classifyFile(png, 'x.txt', '')).toEqual({ kind: 'image', format: 'png' });
  });

  it('turns down WebP and GIF with their own reason', () => {
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
    const gif = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
    expect(classifyFile(webp, 'a.webp', 'image/webp')).toEqual({
      kind: 'rejected',
      reason: 'unsupportedImage',
    });
    expect(classifyFile(gif, 'a.gif', 'image/gif')).toEqual({
      kind: 'rejected',
      reason: 'unsupportedImage',
    });
  });

  it('turns down anything else', () => {
    expect(classifyFile(text('PK zip'), 'a.zip', 'application/zip')).toEqual({
      kind: 'rejected',
      reason: 'notPdf',
    });
    expect(classifyFile(new Uint8Array(0), 'notes', '')).toEqual({
      kind: 'rejected',
      reason: 'notPdf',
    });
  });
});
