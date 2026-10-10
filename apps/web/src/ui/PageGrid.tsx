import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  getClientRect,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, MeasuringConfiguration } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { renderKey } from '@vidopdf/core';
import type { PageEdits, PageRef } from '@vidopdf/core';
import { useSession } from '../state/session';
import { useUi } from '../state/ui-store';
import { thumbnails } from '../thumbnails/thumbnails';
import { moveSelectionToGap } from './actions';
import { runGridIntent } from './grid-intents';
import { interpretGridKey } from './keys';
import { cellRect, gapAt, gridMetrics, indicesInRect, visibleRange } from './grid-layout';
import type { Gap, Rect } from './grid-layout';
import { PageCard, PageFace, fit } from './PageCard';
import { sourceColor } from './source-colors';

/**
 * Cards are placed with a CSS transform. dnd-kit measures the dragged card ignoring transforms by
 * default, which put the drag picture at the grid's top-left corner instead of under the pointer.
 */
const MEASURING: MeasuringConfiguration = {
  draggable: { measure: (element) => getClientRect(element) },
};

/** Rows kept ready above and below the screen. */
export const GRID_ID = 'page-grid';
const OVERSCAN_ROWS = 1;
/** Rows whose thumbnails are requested; wider than what is mounted so scrolling feels instant. */
const PREFETCH_ROWS = 2;

interface Viewport {
  width: number;
  height: number;
  scrollTop: number;
}

function useViewport(target: React.RefObject<HTMLDivElement | null>): Viewport {
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0, scrollTop: 0 });
  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const read = () => {
      setViewport({
        width: element.clientWidth,
        height: element.clientHeight,
        scrollTop: element.scrollTop,
      });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    element.addEventListener('scroll', read, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', read);
    };
  }, [target]);
  return viewport;
}

function pointerInContent(scroller: HTMLElement, clientX: number, clientY: number) {
  const box = scroller.getBoundingClientRect();
  return { x: clientX - box.left + scroller.scrollLeft, y: clientY - box.top + scroller.scrollTop };
}

/** What the card of a page shows about its edits. */
function editMarks(edits: PageEdits | undefined) {
  return { cropped: edits?.crop !== undefined, signed: (edits?.overlays?.length ?? 0) > 0 };
}

export function PageGrid() {
  const { t } = useTranslation();
  const workspace = useSession((state) => state.session.workspace);
  const { select, selectIds } = useSession.getState();
  const thumbSize = useUi((state) => state.thumbSize);
  const activeId = useUi((state) => state.activeId);
  const { setActive, openPreview, announce } = useUi.getState();
  const scroller = useRef<HTMLDivElement>(null);
  const viewport = useViewport(scroller);
  const { pages, sources } = workspace;

  const metrics = useMemo(
    () => gridMetrics(pages.length, viewport.width, thumbSize),
    [pages.length, viewport.width, thumbSize],
  );
  const range = visibleRange(metrics, viewport.scrollTop, viewport.height, OVERSCAN_ROWS);
  const selected = useMemo(() => new Set(workspace.selection), [workspace.selection]);
  const sourceIndex = useMemo(() => new Map(sources.map((s, i) => [s.id, i])), [sources]);
  const activeIndex = useMemo(() => {
    const found = pages.findIndex((page) => page.id === activeId);
    if (found >= 0) return found;
    const firstSelected = workspace.selection[0];
    const fromSelection = pages.findIndex((page) => page.id === firstSelected);
    return fromSelection >= 0 ? fromSelection : 0;
  }, [pages, activeId, workspace.selection]);

  // --- thumbnails: ask for what is on screen, closest rows first --------------------------------
  useEffect(() => {
    const wide = visibleRange(metrics, viewport.scrollTop, viewport.height, PREFETCH_ROWS);
    const middle = Math.floor((range.first + range.last) / 2);
    const indices = Array.from(
      { length: Math.max(0, wide.last - wide.first + 1) },
      (_, i) => wide.first + i,
    ).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
    thumbnails.setWanted(
      indices.flatMap((index) => {
        const page = pages[index];
        return page?.kind === 'original'
          ? [{ key: renderKey(page), sourceId: page.sourceId, pageIndex: page.sourceIndex }]
          : [];
      }),
    );
  }, [metrics, viewport.scrollTop, viewport.height, pages, range.first, range.last]);

  // --- keeping the active page in view ---------------------------------------------------------
  const reveal = useCallback(
    (index: number) => {
      const element = scroller.current;
      if (element === null) return;
      const cell = cellRect(metrics, index);
      if (cell.y < element.scrollTop) element.scrollTop = cell.y - metrics.paddingY;
      else if (cell.y + cell.height > element.scrollTop + element.clientHeight) {
        element.scrollTop = cell.y + cell.height - element.clientHeight + metrics.paddingY;
      }
    },
    [metrics],
  );

  const goTo = (index: number, mode: 'select' | 'extend' | 'move') => {
    const page = pages[Math.max(0, Math.min(pages.length - 1, index))];
    if (page === undefined) return;
    setActive(page.id);
    if (mode === 'select') select(page.id, 'only');
    else if (mode === 'extend') select(page.id, 'range');
    reveal(pages.indexOf(page));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const rowsPerScreen = Math.floor(viewport.height / metrics.rowPitch);
    const intent = interpretGridKey(event, { columns: metrics.columns, rowsPerScreen });
    if (intent === undefined) return;
    event.preventDefault();
    runGridIntent(intent, {
      activeIndex,
      pageCount: pages.length,
      goTo,
      preview: () => {
        const page = pages[activeIndex];
        if (page !== undefined) openPreview(page.id);
      },
    });
  };

  const onSelect = useCallback(
    (id: string, event: MouseEvent) => {
      setActive(id);
      select(id, event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'only');
      scroller.current?.focus({ preventScroll: true });
    },
    [select, setActive],
  );

  // --- rubber band selection ---------------------------------------------------------------------
  const [band, setBand] = useState<Rect | null>(null);
  const canvas = useRef<HTMLDivElement>(null);

  const startBand = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = scroller.current;
    if (event.target !== canvas.current || element === null || event.button !== 0) return;
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const base = additive ? workspace.selection : [];
    const origin = pointerInContent(element, event.clientX, event.clientY);
    if (!additive) useSession.getState().clearSelected();
    element.focus({ preventScroll: true });
    const move = (e: PointerEvent) => {
      const here = pointerInContent(element, e.clientX, e.clientY);
      const rect = {
        x: Math.min(origin.x, here.x),
        y: Math.min(origin.y, here.y),
        width: Math.abs(here.x - origin.x),
        height: Math.abs(here.y - origin.y),
      };
      setBand(rect);
      const ids = indicesInRect(metrics, rect).flatMap((i) =>
        pages[i] === undefined ? [] : [pages[i].id],
      );
      selectIds([...base, ...ids], false);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      setBand(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  // --- dragging pages with the mouse -------------------------------------------------------------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [dragging, setDragging] = useState<readonly string[]>([]);
  const [gap, setGap] = useState<Gap | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const draggingId = dragging[0];

  const refreshGap = useCallback(() => {
    const element = scroller.current;
    if (element === null || pointer.current === null) return;
    const at = pointerInContent(element, pointer.current.x, pointer.current.y);
    setGap(gapAt(metrics, at.x, at.y));
  }, [metrics]);

  useEffect(() => {
    if (dragging.length === 0) return;
    const track = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      refreshGap();
    };
    window.addEventListener('pointermove', track);
    // The container scrolls by itself near its edges while dragging, which moves the gap too.
    const element = scroller.current;
    element?.addEventListener('scroll', refreshGap, { passive: true });
    return () => {
      window.removeEventListener('pointermove', track);
      element?.removeEventListener('scroll', refreshGap);
    };
  }, [dragging.length, refreshGap]);

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!selected.has(id)) select(id, 'only');
    setActive(id);
    const ids = useSession.getState().session.workspace.selection;
    setDragging(ids);
    const origin = event.activatorEvent as PointerEvent;
    pointer.current = { x: origin.clientX, y: origin.clientY };
    announce(t('announce.dragStart', { count: ids.length }));
  };

  const finishDrag = (drop: boolean) => {
    if (drop && gap !== null) {
      moveSelectionToGap(gap.index);
    } else {
      announce(t('announce.dragCancel'));
    }
    setDragging([]);
    setGap(null);
    pointer.current = null;
  };

  // --- render -------------------------------------------------------------------------------------
  const mounted: { page: PageRef; index: number }[] = [];
  for (let index = range.first; index <= range.last; index++) {
    const page = pages[index];
    if (page !== undefined) mounted.push({ page, index });
  }
  const activeCard = pages[activeIndex];
  const linePosition =
    gap === null
      ? null
      : {
          x: metrics.offsetX + gap.column * (metrics.cellWidth + metrics.gap) - metrics.gap / 2,
          y: cellRect(metrics, gap.row * metrics.columns).y,
        };
  const draggedPage = pages.find((page) => page.id === draggingId);
  const overlay = fit(3 / 4, metrics.cellWidth * 0.6, metrics.cellHeight * 0.6);

  return (
    <DndContext
      sensors={sensors}
      measuring={MEASURING}
      onDragStart={onDragStart}
      onDragEnd={() => {
        finishDrag(true);
      }}
      onDragCancel={() => {
        finishDrag(false);
      }}
      accessibility={{ screenReaderInstructions: { draggable: '' } }}
    >
      <div
        ref={scroller}
        id={GRID_ID}
        className="grid-scroll"
        role="listbox"
        aria-multiselectable="true"
        aria-label={t('grid.label')}
        aria-activedescendant={
          activeCard !== undefined && activeIndex >= range.first && activeIndex <= range.last
            ? `page-${activeCard.id}`
            : undefined
        }
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (activeId === null && activeCard !== undefined) setActive(activeCard.id);
        }}
      >
        <div
          ref={canvas}
          className="grid-canvas"
          style={{ height: metrics.contentHeight }}
          onPointerDown={startBand}
        >
          {mounted.map(({ page, index }) => (
            <PageCard
              key={page.id}
              page={page}
              index={index}
              total={pages.length}
              rect={cellRect(metrics, index)}
              sourceName={
                page.kind === 'original'
                  ? (sources[sourceIndex.get(page.sourceId) ?? -1]?.name ?? '')
                  : ''
              }
              color={
                page.kind === 'original'
                  ? sourceColor(sourceIndex.get(page.sourceId) ?? 0)
                  : 'var(--border)'
              }
              selected={selected.has(page.id)}
              active={index === activeIndex}
              dragging={dragging.includes(page.id)}
              {...editMarks(workspace.edits[page.id])}
              onSelect={onSelect}
              onOpen={openPreview}
            />
          ))}
          {linePosition !== null && (
            <div
              className="drop-line"
              data-testid="drop-line"
              style={{
                transform: `translate(${String(linePosition.x)}px, ${String(linePosition.y)}px)`,
                height: metrics.cellHeight,
              }}
            />
          )}
          {band !== null && (
            <div
              className="band"
              style={{
                transform: `translate(${String(band.x)}px, ${String(band.y)}px)`,
                width: band.width,
                height: band.height,
              }}
            />
          )}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedPage === undefined ? null : (
          <div
            className="drag-stack"
            style={{ width: overlay.width + 24, height: overlay.height + 24 }}
          >
            <span className="drag-badge mono">{dragging.length}</span>
            <PageFace page={draggedPage} boxWidth={overlay.width} boxHeight={overlay.height} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
