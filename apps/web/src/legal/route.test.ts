import { describe, expect, it } from 'vitest';
import { LEGAL_PAGES, navigate, pageAt, pathOf } from './route';

describe('pageAt', () => {
  it('knows every legal page by its address, with or without a trailing slash', () => {
    for (const page of LEGAL_PAGES) {
      expect(pageAt(pathOf(page))).toBe(page);
      expect(pageAt(`${pathOf(page)}/`)).toBe(page);
    }
  });

  it('leaves the workspace and unknown addresses alone', () => {
    expect(pageAt('/')).toBeUndefined();
    expect(pageAt('')).toBeUndefined();
    expect(pageAt('/privacy/extra')).toBeUndefined();
    expect(pageAt('/Privacy')).toBeUndefined();
    expect(pageAt('/assets/privacy')).toBeUndefined();
  });
});

describe('navigate', () => {
  it('changes the address without reloading, and tells listeners', () => {
    const seen: string[] = [];
    const listen = () => seen.push(window.location.pathname);
    window.addEventListener('vidopdf:navigate', listen);
    navigate('terms');
    navigate('terms'); // already there: nothing happens
    navigate();
    window.removeEventListener('vidopdf:navigate', listen);
    expect(seen).toEqual(['/terms', '/']);
  });
});
