import { describe, expect, it } from 'vitest';
import { NO_METADATA, cleanMetadata, hasMetadata, parseKeywords } from './metadata';

describe('parseKeywords', () => {
  it('splits on commas, semicolons and new lines, trims, and drops empty and repeated ones', () => {
    expect(parseKeywords(' tax, Tax ;invoice\n\n 2026 ,')).toEqual(['tax', 'invoice', '2026']);
    expect(parseKeywords('')).toEqual([]);
  });
});

describe('cleanMetadata', () => {
  it('trims, removes control characters and cuts very long values', () => {
    const cleaned = cleanMetadata({
      title: '  Report\u0000\u0007 2026  ',
      author: 'a'.repeat(900),
      subject: '',
      keywords: ['x, y', 'x'],
    });
    expect(cleaned.title).toBe('Report 2026');
    expect(cleaned.author).toHaveLength(500);
    expect(cleaned.keywords).toEqual(['x', 'y']);
  });
});

describe('hasMetadata', () => {
  it('is false only when every field is empty', () => {
    expect(hasMetadata(NO_METADATA)).toBe(false);
    expect(hasMetadata({ ...NO_METADATA, keywords: ['k'] })).toBe(true);
    expect(hasMetadata({ ...NO_METADATA, author: 'me' })).toBe(true);
  });
});
