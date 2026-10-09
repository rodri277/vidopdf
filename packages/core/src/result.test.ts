import { describe, expect, it } from 'vitest';
import { pdfError } from './errors';
import { err, mapResult, ok } from './result';

describe('Result', () => {
  it('maps the value of a success', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
  });

  it('leaves a failure untouched', () => {
    const failure = err(pdfError('corrupt'));
    expect(mapResult(failure, () => 1)).toBe(failure);
  });
});

describe('pdfError', () => {
  it('omits the detail when there is none', () => {
    expect(pdfError('empty')).toEqual({ kind: 'empty' });
  });

  it('keeps the technical detail when given', () => {
    expect(pdfError('corrupt', 'bad xref')).toEqual({ kind: 'corrupt', detail: 'bad xref' });
  });
});
