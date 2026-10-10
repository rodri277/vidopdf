import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../state/session';
import { THUMB_MAX, THUMB_MIN, useUi } from '../state/ui-store';
import { PageGrid } from './PageGrid';

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/** Drag-and-drop is wired on the element directly: it is a pointer-only convenience. */
function useFileDrop(target: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    };
    const leave = () => {
      setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      onFiles([...(event.dataTransfer?.files ?? [])]);
    };
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return () => {
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }, [target, onFiles]);

  return dragging;
}

interface StageProps {
  onAddFiles: () => void;
  onFiles: (files: File[]) => void;
}

const FEATURES = [
  'merge',
  'arrange',
  'images',
  'compress',
  'stamps',
  'sign',
  'metadata',
  'protect',
] as const;

export function Stage({ onAddFiles, onFiles }: StageProps) {
  const { t } = useTranslation();
  const pageCount = useSession((state) => state.session.workspace.pages.length);
  const thumbSize = useUi((state) => state.thumbSize);
  const setThumbSize = useUi((state) => state.setThumbSize);
  const stage = useRef<HTMLElement>(null);
  const dragging = useFileDrop(stage, onFiles);

  return (
    <main className="stage" ref={stage} data-dragging={dragging}>
      {pageCount === 0 ? (
        <div className="empty">
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.hint')}</p>
          <ul className="empty-features" aria-label={t('empty.featuresLabel')}>
            {FEATURES.map((feature) => (
              <li key={feature}>{t(`empty.feature.${feature}`)}</li>
            ))}
          </ul>
          <p className="privacy">{t('app.privacy')}</p>
          <button type="button" className="btn btn-primary" onClick={onAddFiles}>
            {t('empty.choose')}
          </button>
        </div>
      ) : (
        <>
          <div className="stage-toolbar">
            <span className="mono">{t('stage.pageCount', { count: pageCount })}</span>
            <label className="zoom">
              <span>{t('stage.zoom')}</span>
              <input
                type="range"
                min={THUMB_MIN}
                max={THUMB_MAX}
                step={10}
                value={thumbSize}
                onChange={(event) => {
                  setThumbSize(Number(event.target.value));
                }}
              />
            </label>
          </div>
          <PageGrid />
        </>
      )}
    </main>
  );
}
