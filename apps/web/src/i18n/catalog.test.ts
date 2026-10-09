import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('translation catalogs', () => {
  it('offer the same keys in Spanish and English', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(es).sort());
  });

  it('use the same interpolation placeholders in both languages', () => {
    const placeholders = (text: string) => [...text.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
    const flat = (catalog: unknown) =>
      Object.fromEntries(
        keysOf(catalog).map((key) => [
          key,
          key
            .split('.')
            .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], catalog),
        ]),
      );
    const spanish = flat(es);
    const english = flat(en);
    for (const key of Object.keys(spanish)) {
      expect(placeholders(String(english[key])), key).toEqual(placeholders(String(spanish[key])));
    }
  });
});
