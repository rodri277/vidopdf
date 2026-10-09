import { useEffect, useRef } from 'react';
import type { MouseEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { renderKey } from '@vidopdf/core';
import type { PageRef } from '@vidopdf/core';
import { useThumbnail } from '../thumbnails/thumbnails';

interface PageCardProps {
  page: PageRef;
  number: number;
  total: number;
  sourceName: string;
  color: string;
  selected: boolean;
  onSelect: (id: string, event: MouseEvent | KeyboardEvent) => void;
}

/** Natural size ratio of the page, before any rotation. */
function ratioOf(page: PageRef, thumbnail: { width: number; height: number } | undefined): number {
  if (page.kind === 'blank') return page.width / page.height;
  return thumbnail === undefined ? 3 / 4 : thumbnail.width / thumbnail.height;
}

export function PageCard({
  page,
  number,
  total,
  sourceName,
  color,
  selected,
  onSelect,
}: PageCardProps) {
  const { t } = useTranslation();
  const thumbnail = useThumbnail(renderKey(page));
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (element === null || thumbnail === undefined) return;
    element.width = thumbnail.width;
    element.height = thumbnail.height;
    element.getContext('2d')?.drawImage(thumbnail.image, 0, 0);
  }, [thumbnail]);

  const sideways = page.rotation === 90 || page.rotation === 270;
  const ratio = ratioOf(page, thumbnail);
  const name = page.kind === 'blank' ? t('grid.blank') : sourceName;

  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={t('grid.pageOf', { n: number, total, name })}
      tabIndex={0}
      className="page-card"
      data-selected={selected}
      data-page-id={page.id}
      style={{ borderTopColor: color }}
      onClick={(event) => {
        onSelect(page.id, event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(page.id, event);
        }
      }}
    >
      <div className="page-frame" style={{ aspectRatio: sideways ? 1 / ratio : ratio }}>
        {page.kind === 'blank' ? (
          <div
            className="page-blank"
            style={{ transform: `rotate(${String(page.rotation)}deg)` }}
          />
        ) : thumbnail === undefined ? (
          <div className="page-skeleton" />
        ) : (
          <canvas
            ref={canvas}
            className="page-canvas"
            data-rotation={page.rotation}
            aria-hidden="true"
          />
        )}
      </div>
      <span className="page-number mono">{number}</span>
    </div>
  );
}
