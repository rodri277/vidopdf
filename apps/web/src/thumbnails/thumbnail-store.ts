import { LruCache, err, pdfError, planRenders } from '@vidopdf/core';
import type { PdfError, RenderedPage, Result } from '@vidopdf/core';

export interface ThumbnailJob {
  /** Cache key: `renderKey(page)`, shared by duplicates of a page. */
  readonly key: string;
  readonly sourceId: string;
  readonly pageIndex: number;
}

/** What draws a page. The real one talks to the render worker; tests pass a fake. */
export interface ThumbnailRenderer {
  render(
    requestId: number,
    sourceId: string,
    pageIndex: number,
    width: number,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>>;
  cancel(requestId: number): void;
}

export interface ThumbnailOptions {
  readonly width: number;
  readonly capacity: number;
  readonly maxInFlight: number;
}

export type Thumbnail = RenderedPage<ImageBitmap>;

/**
 * Thumbnails for the pages on screen: a priority-driven queue in front of the render worker,
 * and an LRU cache that closes each ImageBitmap it lets go of. The UI reads it with
 * `useSyncExternalStore`, per key, so a finished page repaints only its own thumbnail.
 */
export class ThumbnailStore {
  readonly #cache: LruCache<string, Thumbnail>;
  readonly #running = new Map<string, number>();
  readonly #failed = new Set<string>();
  readonly #listeners = new Map<string, Set<() => void>>();
  #wanted: readonly ThumbnailJob[] = [];
  #nextRequest = 1;

  constructor(
    private readonly renderer: ThumbnailRenderer,
    private readonly options: ThumbnailOptions,
  ) {
    this.#cache = new LruCache(options.capacity, (key, thumbnail) => {
      thumbnail.image.close();
      this.#notify(key);
    });
  }

  /** Current thumbnail, or undefined while it is still being drawn. Stable between changes. */
  peek = (key: string): Thumbnail | undefined => this.#cache.peek(key);

  subscribe = (key: string, listener: () => void): (() => void) => {
    const set = this.#listeners.get(key) ?? new Set();
    set.add(listener);
    this.#listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  };

  /** Declares what the screen needs now, most urgent first. Cancels work nobody needs any more. */
  setWanted(jobs: readonly ThumbnailJob[]): void {
    this.#wanted = jobs;
    this.#pump();
  }

  /** Forgets everything cached for a source (it was released). */
  dropSource(sourceId: string): void {
    this.#failed.clear();
    for (const key of [...this.#running.keys()]) {
      if (key.startsWith(`${sourceId}:`)) this.#cancel(key);
    }
    this.#wanted = this.#wanted.filter((job) => job.sourceId !== sourceId);
  }

  clear(): void {
    for (const key of [...this.#running.keys()]) this.#cancel(key);
    this.#cache.clear();
    this.#failed.clear();
    this.#wanted = [];
  }

  #pump(): void {
    const byKey = new Map(this.#wanted.map((job) => [job.key, job]));
    const plan = planRenders({
      wanted: this.#wanted.map((job) => job.key).filter((key) => !this.#failed.has(key)),
      inFlight: new Set(this.#running.keys()),
      cached: (key) => this.#cache.has(key),
      maxInFlight: this.options.maxInFlight,
    });
    for (const key of plan.cancel) this.#cancel(key);
    for (const key of plan.start) {
      const job = byKey.get(key);
      if (job !== undefined) void this.#start(job);
    }
  }

  #cancel(key: string): void {
    const requestId = this.#running.get(key);
    if (requestId === undefined) return;
    this.#running.delete(key);
    this.renderer.cancel(requestId);
  }

  async #start(job: ThumbnailJob): Promise<void> {
    const requestId = this.#nextRequest++;
    this.#running.set(job.key, requestId);
    let result: Result<Thumbnail, PdfError>;
    try {
      result = await this.renderer.render(
        requestId,
        job.sourceId,
        job.pageIndex,
        this.options.width,
      );
    } catch (error) {
      // The worker itself failed (crashed or was terminated); do not retry this page in a loop.
      result = err(pdfError('internal', error instanceof Error ? error.message : String(error)));
    }
    // A cancelled or replaced request answers late; only the current one may touch the cache.
    if (this.#running.get(job.key) !== requestId) {
      if (result.ok) result.value.image.close();
      return;
    }
    this.#running.delete(job.key);
    if (result.ok) {
      this.#cache.set(job.key, result.value);
      this.#notify(job.key);
    } else if (result.error.kind !== 'cancelled') {
      this.#failed.add(job.key);
    }
    this.#pump();
  }

  #notify(key: string): void {
    for (const listener of this.#listeners.get(key) ?? []) listener();
  }
}
