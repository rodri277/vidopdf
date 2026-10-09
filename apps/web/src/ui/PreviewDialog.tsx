import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageRef, RenderedPage } from '@vidopdf/core';
import { useSession } from '../state/session-store';
import { useUi } from '../state/ui-store';
import { renderWorker } from '../workers/clients';
import { GRID_ID } from './PageGrid';
import { Modal } from './Modal';

/** Wide enough to fill a large screen; the adapter caps the canvas area for safety. */
const PREVIEW_WIDTH = 1600;
let nextRequest = 1_000_000;

type Drawn =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly image: RenderedPage<ImageBitmap> }
  | { readonly state: 'failed' };

/** Draws one page at preview size. The answer is only used while it still belongs to the page. */
function usePagePicture(page: PageRef | undefined): Drawn {
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

/** Arrow keys, Page keys, Home and End walk through the pages while the preview is open. */
function useWalking(index: number, count: number, go: (to: number) => void) {
  return useCallback(
    (event: KeyboardEvent) => {
      const targets: Record<string, number> = {
        ArrowLeft: index - 1,
        ArrowUp: index - 1,
        PageUp: index - 1,
        ArrowRight: index + 1,
        ArrowDown: index + 1,
        PageDown: index + 1,
        Home: 0,
        End: count - 1,
      };
      const to = targets[event.key];
      if (to === undefined) return;
      event.preventDefault();
      go(to);
    },
    [index, count, go],
  );
}

function Picture({ page, drawn, label }: { page: PageRef; drawn: Drawn; label: string }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (element === null || drawn.state !== 'ready') return;
    element.width = drawn.image.width;
    element.height = drawn.image.height;
    element.getContext('2d')?.drawImage(drawn.image.image, 0, 0);
  }, [drawn]);

  if (page.kind === 'blank') {
    const sideways = page.rotation === 90 || page.rotation === 270;
    const ratio = sideways ? page.height / page.width : page.width / page.height;
    return (
      <div
        className="preview-blank"
        role="img"
        aria-label={t('preview.blank')}
        style={{ aspectRatio: ratio }}
      />
    );
  }
  if (drawn.state === 'ready') {
    return (
      <div role="img" aria-label={label} className="preview-picture">
        <canvas
          ref={canvas}
          className="preview-canvas"
          data-rotation={page.rotation}
          aria-hidden="true"
        />
      </div>
    );
  }
  return (
    <p role="status" className="muted">
      {drawn.state === 'failed' ? t('preview.failed') : t('preview.loading')}
    </p>
  );
}

export function PreviewDialog() {
  const { t } = useTranslation();
  const previewId = useUi((state) => state.previewId);
  const pages = useSession((state) => state.session.workspace.pages);
  const { openPreview, closePreview, setActive } = useUi.getState();
  const index = pages.findIndex((page) => page.id === previewId);
  const page = pages[index];
  const drawn = usePagePicture(page);

  const go = useCallback(
    (to: number) => {
      const target = pages[Math.max(0, Math.min(pages.length - 1, to))];
      if (target === undefined) return;
      openPreview(target.id);
      setActive(target.id);
    },
    [pages, openPreview, setActive],
  );
  const close = () => {
    if (page !== undefined) setActive(page.id);
    closePreview();
    // The dialog is removed from the page, so the browser cannot hand the focus back by itself.
    queueMicrotask(() => document.getElementById(GRID_ID)?.focus());
  };
  const onKey = useWalking(index, pages.length, go);
  const title = t('preview.title', { n: index + 1, total: pages.length });

  return (
    <Modal
      open={page !== undefined}
      labelledBy="preview-title"
      onClose={close}
      onKey={onKey}
      className="preview-dialog"
    >
      {page !== undefined && (
        <>
          <header className="preview-bar">
            <h2 id="preview-title" className="mono">
              {title}
            </h2>
            <button
              type="button"
              className="btn btn-small"
              disabled={index <= 0}
              onClick={() => {
                go(index - 1);
              }}
            >
              {t('preview.previous')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={index >= pages.length - 1}
              onClick={() => {
                go(index + 1);
              }}
            >
              {t('preview.next')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focus must land inside the dialog
              autoFocus
              onClick={close}
            >
              {t('preview.close')}
            </button>
          </header>
          <div className="preview-stage">
            <Picture page={page} drawn={drawn} label={title} />
          </div>
        </>
      )}
    </Modal>
  );
}
