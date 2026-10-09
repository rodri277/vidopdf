import { useSyncExternalStore } from 'react';
import { renderWorker } from '../workers/clients';
import { ThumbnailStore } from './thumbnail-store';
import type { Thumbnail } from './thumbnail-store';

/** Wide enough for the largest grid size at 2x density; kept small so 160 of them fit in ~85 MB. */
export const THUMBNAIL_WIDTH = 320;

export const thumbnails = new ThumbnailStore(
  {
    render: (requestId, sourceId, pageIndex, width) =>
      renderWorker().render(requestId, sourceId, pageIndex, width),
    cancel: (requestId) => {
      void renderWorker().cancel(requestId);
    },
  },
  { width: THUMBNAIL_WIDTH, capacity: 160, maxInFlight: 3 },
);

export function useThumbnail(key: string): Thumbnail | undefined {
  return useSyncExternalStore(
    (listener) => thumbnails.subscribe(key, listener),
    () => thumbnails.peek(key),
  );
}
