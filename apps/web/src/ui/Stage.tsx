import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { renderKey } from '@vidopdf/core';
import { thumbnails } from '../thumbnails/thumbnails';
import { useSession } from '../state/session-store';
import { PageCard } from './PageCard';
import { sourceColor } from './source-colors';

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

/** Until the grid is virtualized, only the first pages are asked for. */
const WANTED_LIMIT = 120;

interface StageProps {
  onAddFiles: () => void;
  onFiles: (files: File[]) => void;
}

export function Stage({ onAddFiles, onFiles }: StageProps) {
  const { t } = useTranslation();
  const workspace = useSession((state) => state.session.workspace);
  const select = useSession((state) => state.select);
  const stage = useRef<HTMLElement>(null);
  const dragging = useFileDrop(stage, onFiles);
  const { pages, sources } = workspace;
  const selected = useMemo(() => new Set(workspace.selection), [workspace.selection]);
  const sourceIndex = useMemo(() => new Map(sources.map((s, i) => [s.id, i])), [sources]);

  useEffect(() => {
    thumbnails.setWanted(
      pages
        .slice(0, WANTED_LIMIT)
        .flatMap((page) =>
          page.kind === 'original'
            ? [{ key: renderKey(page), sourceId: page.sourceId, pageIndex: page.sourceIndex }]
            : [],
        ),
    );
  }, [pages]);

  const onSelect = (id: string, event: MouseEvent | KeyboardEvent) => {
    select(id, event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'only');
  };

  return (
    <main className="stage" ref={stage} data-dragging={dragging}>
      {pages.length === 0 ? (
        <div className="empty">
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.hint')}</p>
          <p className="privacy">{t('app.privacy')}</p>
          <button type="button" className="btn btn-primary" onClick={onAddFiles}>
            {t('empty.choose')}
          </button>
        </div>
      ) : (
        <div
          className="grid"
          role="listbox"
          aria-multiselectable="true"
          aria-label={t('grid.label')}
        >
          {pages.map((page, index) => {
            const source =
              page.kind === 'original' ? sources[sourceIndex.get(page.sourceId) ?? -1] : undefined;
            return (
              <PageCard
                key={page.id}
                page={page}
                number={index + 1}
                total={pages.length}
                sourceName={source?.name ?? ''}
                color={
                  page.kind === 'original'
                    ? sourceColor(sourceIndex.get(page.sourceId) ?? 0)
                    : 'var(--border)'
                }
                selected={selected.has(page.id)}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
