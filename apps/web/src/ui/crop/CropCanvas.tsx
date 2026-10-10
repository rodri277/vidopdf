import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { normalizeCrop } from '@vidopdf/core';
import type { Margins, PageRef, RenderedPage } from '@vidopdf/core';
import { PageCanvas } from '../PageCanvas';

type Edge = keyof Margins;

interface Props {
  readonly page: PageRef;
  readonly picture: RenderedPage<ImageBitmap>;
  readonly margins: Margins;
  readonly onChange: (margins: Margins) => void;
  /** Gives the pixels of the picture, as the reader sees it, to whoever asks (to find the margins). */
  readonly pixelsRef: { current: (() => ImageData | undefined) | undefined };
}

const EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

/**
 * The page as the reader sees it, with the part that will be cut dimmed and an edge on each side
 * to drag. The picture is turned while it is drawn, so everything here is in the reader's view,
 * which is how margins are stored.
 */
export function CropCanvas({ page, picture, margins, onChange, pixelsRef }: Props) {
  const frame = useRef<HTMLDivElement>(null);

  const drag = (edge: Edge) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0) return;
    const box = frame.current?.getBoundingClientRect();
    if (box === undefined) return;
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    const value = { top: y, left: x, right: 1 - x, bottom: 1 - y }[edge];
    onChange(normalizeCrop({ ...margins, [edge]: Math.max(0, value) }));
  };

  const style = {
    '--top': `${String(margins.top * 100)}%`,
    '--right': `${String(margins.right * 100)}%`,
    '--bottom': `${String(margins.bottom * 100)}%`,
    '--left': `${String(margins.left * 100)}%`,
  } as React.CSSProperties;

  return (
    <div className="crop-frame" ref={frame} style={style}>
      <PageCanvas page={page} picture={picture} className="crop-canvas" pixelsRef={pixelsRef} />
      <div className="crop-dim crop-dim-top" aria-hidden="true" />
      <div className="crop-dim crop-dim-bottom" aria-hidden="true" />
      <div className="crop-dim crop-dim-left" aria-hidden="true" />
      <div className="crop-dim crop-dim-right" aria-hidden="true" />
      <div className="crop-window" aria-hidden="true" />
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={`crop-edge crop-edge-${edge}`}
          aria-hidden="true"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={drag(edge)}
        />
      ))}
    </div>
  );
}
