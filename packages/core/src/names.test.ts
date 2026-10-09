import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { paddedNumber, safeFileName, stripExtension, uniqueNames } from './names';

describe('safeFileName', () => {
  it('keeps an ordinary name', () => {
    expect(safeFileName('informe final.pdf')).toBe('informe final.pdf');
  });

  it('removes path separators and traversal', () => {
    expect(safeFileName('../../etc/passwd')).toBe('_.._etc_passwd');
  });

  it('removes characters Windows forbids and control characters', () => {
    expect(safeFileName('a<b>:c"d|e?f*g\u0001.pdf')).toBe('a_b_c_d_e_f_g_.pdf');
  });

  it('never returns an empty or hidden name', () => {
    expect(safeFileName('   ')).toBe('document');
    expect(safeFileName('...hidden.pdf')).toBe('hidden.pdf');
    expect(safeFileName('', 'fallback.pdf')).toBe('fallback.pdf');
  });

  it('limits the length', () => {
    expect(safeFileName('x'.repeat(500)).length).toBe(120);
  });

  it('never contains a separator, whatever it is given', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const safe = safeFileName(name);
        expect(safe).not.toMatch(/[/\\]/);
        expect(safe.length).toBeGreaterThan(0);
        expect(safe.startsWith('.')).toBe(false);
      }),
    );
  });
});

describe('stripExtension', () => {
  it('removes only the last extension', () => {
    expect(stripExtension('report.final.pdf')).toBe('report.final');
  });

  it('leaves names without an extension, and dotfiles, alone', () => {
    expect(stripExtension('report')).toBe('report');
    expect(stripExtension('.hidden')).toBe('.hidden');
  });
});

describe('paddedNumber', () => {
  it('pads to the width of the total', () => {
    expect(paddedNumber(3, 120)).toBe('003');
    expect(paddedNumber(7, 9)).toBe('7');
    expect(paddedNumber(1, 0)).toBe('1');
  });
});

describe('uniqueNames', () => {
  it('numbers repeated names before the extension and ignores case', () => {
    expect(uniqueNames(['a.pdf', 'A.pdf', 'b.pdf', 'a.pdf'])).toEqual([
      'a.pdf',
      'A (2).pdf',
      'b.pdf',
      'a (3).pdf',
    ]);
  });

  it('handles names without an extension', () => {
    expect(uniqueNames(['part', 'part'])).toEqual(['part', 'part (2)']);
  });

  it('always yields as many distinct names as it was given', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a.pdf', 'A.PDF', 'b.pdf', 'a (2).pdf'), { maxLength: 20 }),
        (names) => {
          const result = uniqueNames(names);
          expect(new Set(result.map((n) => n.toLowerCase())).size).toBe(names.length);
        },
      ),
    );
  });
});
