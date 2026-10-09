import { describe, expect, it, vi } from 'vitest';
import { err, ok, pdfError } from '@vidopdf/core';
import type { PdfError, RenderedPage, Result } from '@vidopdf/core';
import { ThumbnailStore } from './thumbnail-store';
import type { ThumbnailJob, ThumbnailRenderer } from './thumbnail-store';

interface Pending {
  requestId: number;
  job: ThumbnailJob;
  settle: (result: Result<RenderedPage<ImageBitmap>, PdfError>) => void;
}

/** A renderer the test finishes by hand, so it can check what is cancelled and in which order. */
function fakeRenderer() {
  const pending: Pending[] = [];
  const cancelled: number[] = [];
  const renderer: ThumbnailRenderer = {
    render: (requestId, sourceId, pageIndex) =>
      new Promise((settle) => {
        pending.push({
          requestId,
          job: { key: `${sourceId}:${String(pageIndex)}`, sourceId, pageIndex },
          settle,
        });
      }),
    cancel: (requestId) => cancelled.push(requestId),
  };
  return { renderer, pending, cancelled };
}

function bitmap() {
  const close = vi.fn();
  return {
    image: { close } as unknown as ImageBitmap,
    close,
    width: 10,
    height: 10,
    pointsWidth: 595,
    pointsHeight: 842,
  };
}

const job = (pageIndex: number): ThumbnailJob => ({
  key: `s:${String(pageIndex)}`,
  sourceId: 's',
  pageIndex,
});
const options = { width: 320, capacity: 2, maxInFlight: 2 };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ThumbnailStore', () => {
  it('renders the most urgent pages first, up to the limit', () => {
    const { renderer, pending } = fakeRenderer();
    new ThumbnailStore(renderer, options).setWanted([job(0), job(1), job(2)]);
    expect(pending.map((p) => p.job.key)).toEqual(['s:0', 's:1']);
  });

  it('caches a finished page, notifies its listeners and starts the next one', async () => {
    const { renderer, pending } = fakeRenderer();
    const store = new ThumbnailStore(renderer, options);
    const listener = vi.fn();
    store.subscribe('s:0', listener);
    store.setWanted([job(0), job(1), job(2)]);
    const first = bitmap();
    pending[0]?.settle(ok(first));
    await tick();
    expect(store.peek('s:0')).toBe(first);
    expect(listener).toHaveBeenCalledOnce();
    expect(pending.map((p) => p.job.key)).toEqual(['s:0', 's:1', 's:2']);
  });

  it('cancels renders for pages that scrolled out of view', () => {
    const { renderer, pending, cancelled } = fakeRenderer();
    const store = new ThumbnailStore(renderer, options);
    store.setWanted([job(0), job(1)]);
    store.setWanted([job(5)]);
    expect(cancelled).toEqual([pending[0]?.requestId, pending[1]?.requestId]);
    expect(pending.at(-1)?.job.key).toBe('s:5');
  });

  it('drops the answer of a cancelled render and closes its bitmap', async () => {
    const { renderer, pending } = fakeRenderer();
    const store = new ThumbnailStore(renderer, options);
    store.setWanted([job(0)]);
    store.setWanted([job(9)]);
    const late = bitmap();
    pending[0]?.settle(ok(late));
    await tick();
    expect(store.peek('s:0')).toBeUndefined();
    expect(late.close).toHaveBeenCalledOnce();
  });

  it('closes the bitmap of an evicted thumbnail and tells the page that showed it', async () => {
    const { renderer, pending } = fakeRenderer();
    const store = new ThumbnailStore(renderer, { ...options, capacity: 1 });
    const evictedListener = vi.fn();
    store.subscribe('s:0', evictedListener);
    store.setWanted([job(0), job(1)]);
    const first = bitmap();
    pending[0]?.settle(ok(first));
    await tick();
    pending[1]?.settle(ok(bitmap()));
    await tick();
    expect(first.close).toHaveBeenCalledOnce();
    expect(store.peek('s:0')).toBeUndefined();
    expect(evictedListener).toHaveBeenCalledTimes(2);
  });

  it('does not retry a page that failed, and keeps going with the others', async () => {
    const { renderer, pending } = fakeRenderer();
    const store = new ThumbnailStore(renderer, { ...options, maxInFlight: 1 });
    store.setWanted([job(0), job(1)]);
    pending[0]?.settle(err(pdfError('corrupt')));
    await tick();
    expect(pending.map((p) => p.job.key)).toEqual(['s:0', 's:1']);
    store.setWanted([job(0), job(1)]);
    expect(pending.filter((p) => p.job.key === 's:0')).toHaveLength(1);
  });

  it('treats a crashed worker as a failed page instead of throwing', async () => {
    const renderer: ThumbnailRenderer = {
      render: () => Promise.reject(new Error('worker died')),
      cancel: () => undefined,
    };
    const store = new ThumbnailStore(renderer, options);
    store.setWanted([job(0)]);
    await tick();
    expect(store.peek('s:0')).toBeUndefined();
  });

  it('forgets everything on clear and drops one source on dropSource', async () => {
    const { renderer, pending, cancelled } = fakeRenderer();
    const store = new ThumbnailStore(renderer, options);
    store.setWanted([job(0)]);
    store.dropSource('s');
    expect(cancelled).toHaveLength(1);
    store.setWanted([job(1)]);
    const done = bitmap();
    pending.at(-1)?.settle(ok(done));
    await tick();
    store.clear();
    expect(done.close).toHaveBeenCalledOnce();
    expect(store.peek('s:1')).toBeUndefined();
  });

  it('stops notifying a listener that unsubscribed', async () => {
    const { renderer, pending } = fakeRenderer();
    const store = new ThumbnailStore(renderer, options);
    const listener = vi.fn();
    const unsubscribe = store.subscribe('s:0', listener);
    unsubscribe();
    store.setWanted([job(0)]);
    pending[0]?.settle(ok(bitmap()));
    await tick();
    expect(listener).not.toHaveBeenCalled();
  });
});
