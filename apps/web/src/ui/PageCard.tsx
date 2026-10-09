import { memo, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { renderKey } from '@vidopdf/core';
import type { PageRef } from '@vidopdf/core';
import { useThumbnail } from '../thumbnails/thumbnails';
import type { Rect } from './grid-layout';

const CARD_PADDING = 8;
/** Matches the page-number label under the frame in app.css. */
const LABEL = 28;

export interface PageCardProps {
  page: PageRef;
  index: number;
  total: number;
  rect: Rect;
  sourceName: string;
  color: string;
  selected: boolean;
  active: boolean;
  dragging: boolean;
  onSelect: (id: string, event: MouseEvent) => void;
  onOpen: (id: string) => void;
}

/** Largest rectangle with the given aspect ratio that fits the box. */
export function fit(ratio: number, boxWidth: number, boxHeight: number) {
  const width = Math.min(boxWidth, boxHeight * ratio);
  return { width, height: width / ratio };
}

export function PageFace({
  page,
  boxWidth,
  boxHeight,
}: {
  page: PageRef;
  boxWidth: number;
  boxHeight: number;
}) {
  const thumbnail = useThumbnail(renderKey(page));
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (element === null || thumbnail === undefined) return;
    element.width = thumbnail.width;
    element.height = thumbnail.height;
    element.getContext('2d')?.drawImage(thumbnail.image, 0, 0);
  }, [thumbnail]);

  const natural =
    page.kind === 'blank'
      ? page.width / page.height
      : thumbnail
        ? thumbnail.width / thumbnail.height
        : 3 / 4;
  const sideways = page.rotation === 90 || page.rotation === 270;
  const { width, height } = fit(sideways ? 1 / natural : natural, boxWidth, boxHeight);

  return (
    <div className="page-frame" style={{ width, height }}>
      {page.kind === 'blank' ? (
        <div className="page-blank" />
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
  );
}

export const PageCard = memo(function PageCard(props: PageCardProps) {
  const {
    page,
    index,
    total,
    rect,
    sourceName,
    color,
    selected,
    active,
    dragging,
    onSelect,
    onOpen,
  } = props;
  const { t } = useTranslation();
  const { setNodeRef, listeners } = useDraggable({ id: page.id });
  const name = page.kind === 'blank' ? t('grid.blank') : sourceName;

  return (
    // Virtual focus: the listbox keeps the keyboard focus and points at the active option with
    // aria-activedescendant, so options are deliberately not focusable and have no key handlers.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      ref={setNodeRef}
      id={`page-${page.id}`}
      role="option"
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={t('grid.pageOf', { n: index + 1, total, name })}
      className="page-card"
      data-selected={selected}
      data-active={active}
      data-dragging={dragging}
      data-origin={
        page.kind === 'original' ? `${sourceName}#${String(page.sourceIndex + 1)}` : 'blank'
      }
      style={{
        transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
        width: rect.width,
        height: rect.height,
        borderTopColor: color,
      }}
      onClick={(event) => {
        onSelect(page.id, event);
      }}
      onDoubleClick={() => {
        onOpen(page.id);
      }}
      {...listeners}
    >
      <div className="page-box">
        <PageFace
          page={page}
          boxWidth={rect.width - 2 * CARD_PADDING}
          boxHeight={rect.height - LABEL - CARD_PADDING}
        />
      </div>
      <span className="page-number mono">{index + 1}</span>
    </div>
  );
});
