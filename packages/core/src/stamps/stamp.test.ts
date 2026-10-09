import { describe, expect, it } from 'vitest';
import { stampAppliesTo, stampsFor } from './select';
import { presets, stampProblems } from './stamp';
import type { ImageStamp } from './stamp';
import { renderTemplate, toRoman } from './template';

const context = { n: 4, total: 12, file: 'report.pdf', date: '2026-10-09' };

describe('renderTemplate', () => {
  it('fills every token', () => {
    expect(renderTemplate('{file} · {n} / {total} · {date}', context)).toBe(
      'report.pdf · 4 / 12 · 2026-10-09',
    );
  });

  it('writes the number in Roman numerals, lower or upper case', () => {
    expect(renderTemplate('{n:roman}', context)).toBe('iv');
    expect(renderTemplate('{n:ROMAN}', context)).toBe('IV');
  });

  it('leaves what it does not know as typed, so a mistake can be seen', () => {
    expect(renderTemplate('{page} {n:hex} {total:roman}', context)).toBe(
      '{page} {n:hex} {total:roman}',
    );
  });
});

describe('toRoman', () => {
  it('writes the classic examples and falls back to digits outside 1 to 3999', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map(toRoman)).toEqual([
      'I',
      'IV',
      'IX',
      'XIV',
      'XL',
      'XC',
      'CD',
      'MCMXCIV',
      'MMMCMXCIX',
    ]);
    expect(toRoman(0)).toBe('0');
    expect(toRoman(4000)).toBe('4000');
    expect(toRoman(2.5)).toBe('2.5');
  });
});

describe('which pages a stamp goes on', () => {
  const base = presets.pageNumber('s');
  it('all, odd and even are counted as people count: the first page is the 1st', () => {
    const numbers = (stamp = base) =>
      Array.from({ length: 6 }, (_, i) => i)
        .filter((i) => stampAppliesTo(stamp, i, 6))
        .map((i) => i + 1);
    expect(numbers()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(numbers({ ...base, pages: { kind: 'odd' } })).toEqual([1, 3, 5]);
    expect(numbers({ ...base, pages: { kind: 'even' } })).toEqual([2, 4, 6]);
    expect(numbers({ ...base, pages: { kind: 'ranges', text: '2-3, 6' } })).toEqual([2, 3, 6]);
    expect(numbers({ ...base, skipFirst: true })).toEqual([2, 3, 4, 5, 6]);
  });

  it('a range that does not fit the output matches nothing instead of failing', () => {
    expect(stampAppliesTo({ ...base, pages: { kind: 'ranges', text: '9' } }, 0, 6)).toBe(false);
    expect(stampAppliesTo({ ...base, pages: { kind: 'ranges', text: '??' } }, 0, 6)).toBe(false);
  });

  it('stampsFor keeps the order they were added in', () => {
    const a = presets.header('a');
    const b = { ...presets.footer('b'), pages: { kind: 'even' as const } };
    expect(stampsFor([a, b], 0, 4).map((s) => s.id)).toEqual(['a']);
    expect(stampsFor([a, b], 1, 4).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('stampProblems', () => {
  it('accepts every preset', () => {
    for (const stamp of [
      presets.pageNumber('a'),
      presets.header('b'),
      presets.footer('c'),
      presets.watermark('d', 'DRAFT'),
    ])
      expect(stampProblems(stamp)).toEqual([]);
  });

  it('names each thing that is wrong', () => {
    const bad = {
      ...presets.pageNumber('a'),
      opacity: 2,
      rotation: 900,
      margin: -1,
      fontSize: 1,
      color: 'red',
      template: '   ',
      startAt: 1.5,
      pages: { kind: 'ranges' as const, text: 'abc' },
    };
    expect(stampProblems(bad).sort()).toEqual(
      [
        'color',
        'fontSize',
        'margin',
        'opacity',
        'ranges',
        'rotation',
        'startAt',
        'template',
      ].sort(),
    );
  });

  it('checks the size of a picture stamp', () => {
    const picture: ImageStamp = {
      kind: 'image',
      id: 'i',
      assetId: 'x',
      anchor: 'center',
      margin: 0,
      opacity: 1,
      rotation: 0,
      pages: { kind: 'all' },
      skipFirst: false,
      width: 120,
      aspect: 0.5,
    };
    expect(stampProblems(picture)).toEqual([]);
    expect(stampProblems({ ...picture, width: 0 })).toEqual(['size']);
    expect(stampProblems({ ...picture, aspect: 0 })).toEqual(['size']);
  });
});
