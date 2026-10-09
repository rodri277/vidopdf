import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from './file-io';

describe('sanitizeFileName', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeFileName('informe final.pdf')).toBe('informe final.pdf');
  });

  it('removes path separators and traversal', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('_.._etc_passwd');
  });

  it('removes characters Windows forbids and control characters', () => {
    expect(sanitizeFileName('a<b>:c"d|e?f*g\u0001.pdf')).toBe('a_b_c_d_e_f_g_.pdf');
  });

  it('never returns an empty or hidden name', () => {
    expect(sanitizeFileName('   ')).toBe('document.pdf');
    expect(sanitizeFileName('...hidden.pdf')).toBe('hidden.pdf');
  });

  it('limits the length', () => {
    expect(sanitizeFileName('x'.repeat(500)).length).toBe(120);
  });
});
