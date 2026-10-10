import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import { describePages, failureMessage, splitErrorMessage } from './messages';

let spanish: typeof i18next.t;
let english: typeof i18next.t;

beforeAll(async () => {
  const make = async (lng: 'es' | 'en') => {
    const instance = i18next.createInstance();
    await instance.init({
      lng,
      resources: { es: { translation: es }, en: { translation: en } },
      interpolation: { escapeValue: false },
    });
    return instance.t.bind(instance);
  };
  spanish = await make('es');
  english = await make('en');
});

describe('splitErrorMessage', () => {
  it('names the page and both sizes when one page cannot fit', () => {
    const error = {
      kind: 'pageTooLarge',
      pageNumber: 7,
      size: 3_355_443,
      limit: 1_048_576,
    } as const;
    expect(splitErrorMessage(spanish, error)).toBe(
      'La página 7 ocupa 3.2 MB ella sola y no cabe en el límite de 1.0 MB. Sube el límite o quita esa página.',
    );
    expect(splitErrorMessage(english, error)).toContain('Page 7 is 3.2 MB on its own');
  });

  it('quotes what the user typed when a range is wrong', () => {
    expect(
      splitErrorMessage(spanish, { kind: 'ranges', problem: { kind: 'syntax', token: 'abc' } }),
    ).toContain('«abc»');
    expect(
      splitErrorMessage(english, {
        kind: 'ranges',
        problem: { kind: 'outOfRange', token: '1-99', pageCount: 6 },
      }),
    ).toBe('"1-99": the document only has 6 pages.');
  });

  it('has a message for every kind of problem, in both languages', () => {
    const errors = [
      { kind: 'ranges', problem: { kind: 'empty' } },
      { kind: 'ranges', problem: { kind: 'zero', token: '0' } },
      { kind: 'ranges', problem: { kind: 'reversed', token: '9-3' } },
      { kind: 'noPages' },
      { kind: 'invalidCount' },
      { kind: 'invalidLimit' },
      { kind: 'cancelled' },
      { kind: 'measureFailed', detail: 'x' },
    ] as const;
    for (const error of errors) {
      for (const t of [spanish, english]) {
        const text = splitErrorMessage(t, error);
        expect(text.length).toBeGreaterThan(5);
        expect(text).not.toContain('export.errors');
      }
    }
  });
});

describe('failureMessage', () => {
  it('explains an unsupported format and keeps the technical detail apart', () => {
    expect(failureMessage(english, { kind: 'unsupported', detail: 'webp' })).toEqual({
      text: 'This browser cannot create that image format. Try PNG or JPEG.',
      detail: 'webp',
    });
    expect(failureMessage(spanish, { kind: 'corrupt' }).text).toContain('No se pudo terminar');
  });

  it('uses the split wording for split failures', () => {
    expect(failureMessage(english, { kind: 'split', error: { kind: 'noPages' } })).toEqual({
      text: 'There are no pages to split.',
      detail: undefined,
    });
  });
});

describe('describePages', () => {
  it('folds runs of consecutive pages', () => {
    expect(describePages([3, 5, 6, 7, 10])).toBe('3, 5-7, 10');
    expect(describePages([])).toBe('');
    expect(describePages([4])).toBe('4');
  });
});

describe('failureMessage for something that could not be written', () => {
  it('blames the picture format only for pictures out, and the added content for a PDF', () => {
    const failure = { kind: 'unsupported', detail: 'characters without a glyph: 你' } as const;
    expect(failureMessage(spanish, failure, 'images').text).toContain('formato de imagen');
    expect(failureMessage(spanish, failure, 'pdf').text).toContain(
      'texto o una imagen que has añadido',
    );
    expect(failureMessage(english, failure, 'split').text).toContain('text or a picture you added');
    expect(failureMessage(english, failure, 'pdf').detail).toBe('characters without a glyph: 你');
  });
});
