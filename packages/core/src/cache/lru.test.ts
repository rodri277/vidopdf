import { describe, expect, it, vi } from 'vitest';
import { LruCache } from './lru';

describe('LruCache', () => {
  it('rejects a capacity below one', () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
    expect(() => new LruCache(1.5)).toThrow(RangeError);
  });

  it('evicts the least recently used entry and reports it', () => {
    const evicted = vi.fn();
    const cache = new LruCache<string, number>(2, evicted);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(evicted).toHaveBeenCalledExactlyOnceWith('b', 2);
    expect(cache.has('a') && cache.has('c') && !cache.has('b')).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('reports a replaced value but not a re-set of the same one', () => {
    const evicted = vi.fn();
    const cache = new LruCache<string, object>(2, evicted);
    const first = {};
    cache.set('a', first);
    cache.set('a', first);
    expect(evicted).not.toHaveBeenCalled();
    cache.set('a', {});
    expect(evicted).toHaveBeenCalledExactlyOnceWith('a', first);
  });

  it('returns undefined for a missing key and reports everything on clear', () => {
    const evicted = vi.fn();
    const cache = new LruCache<string, number>(3, evicted);
    expect(cache.get('x')).toBeUndefined();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(evicted).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it('peeks without refreshing the entry', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.peek('a')).toBe(1);
    expect(cache.peek('zzz')).toBeUndefined();
    cache.set('c', 3);
    expect(cache.has('a')).toBe(false);
  });

  it('works without an eviction callback', () => {
    const cache = new LruCache<number, number>(1);
    cache.set(1, 1);
    cache.set(2, 2);
    expect(cache.has(1)).toBe(false);
    cache.clear();
  });
});
