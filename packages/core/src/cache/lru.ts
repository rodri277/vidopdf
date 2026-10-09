/**
 * Least-recently-used cache. `onEvict` runs for every entry that leaves it (evicted, replaced or
 * cleared), which is where an ImageBitmap gets closed.
 */
export class LruCache<K, V> {
  readonly #entries = new Map<K, V>();

  constructor(
    readonly capacity: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be >= 1');
  }

  get size(): number {
    return this.#entries.size;
  }

  has(key: K): boolean {
    return this.#entries.has(key);
  }

  /** Reads and marks the entry as most recently used. */
  get(key: K): V | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    const previous = this.#entries.get(key);
    if (previous !== undefined) {
      this.#entries.delete(key);
      if (previous !== value) this.onEvict?.(key, previous);
    }
    this.#entries.set(key, value);
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.entries().next();
      if (oldest.done) break;
      const [oldKey, oldValue] = oldest.value;
      this.#entries.delete(oldKey);
      this.onEvict?.(oldKey, oldValue);
    }
  }

  clear(): void {
    const all = [...this.#entries];
    this.#entries.clear();
    for (const [key, value] of all) this.onEvict?.(key, value);
  }
}
