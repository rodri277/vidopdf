import { useEffect, useState } from 'react';
import type { PageRef, RenderedPage } from '@vidopdf/core';
import { renderWorker } from '../workers/clients';

/** Wide enough to fill a large screen; the adapter caps the canvas area for safety. */
export const PREVIEW_WIDTH = 1600;
let nextRequest = 1_000_000;

export type Drawn =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly image: RenderedPage<ImageBitmap> }
  | { readonly state: 'failed' };

/** Draws one page at preview size. The answer is only used while it still belongs to the page. */
export function usePagePicture(page: PageRef | undefined): Drawn {
  const key =
    page?.kind === 'original' ? `${page.sourceId}:${String(page.sourceIndex)}` : undefined;
  const [result, setResult] = useState<{ key: string; drawn: Drawn } | undefined>();
  const sourceId = page?.kind === 'original' ? page.sourceId : undefined;
  const pageIndex = page?.kind === 'original' ? page.sourceIndex : 0;

  useEffect(() => {
    if (sourceId === undefined || key === undefined) return;
    const requestId = nextRequest++;
    let current = true;
    let bitmap: ImageBitmap | undefined;
    void renderWorker()
      .render(requestId, sourceId, pageIndex, PREVIEW_WIDTH)
      .then((rendered) => {
        if (!current) {
          if (rendered.ok) rendered.value.image.close();
          return;
        }
        if (rendered.ok) bitmap = rendered.value.image;
        setResult({
          key,
          drawn: rendered.ok ? { state: 'ready', image: rendered.value } : { state: 'failed' },
        });
      });
    return () => {
      current = false;
      void renderWorker().cancel(requestId);
      bitmap?.close();
    };
  }, [key, sourceId, pageIndex]);

  return result !== undefined && result.key === key ? result.drawn : { state: 'loading' };
}
