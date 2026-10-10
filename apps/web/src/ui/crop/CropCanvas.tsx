import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { normalizeCrop } from '@vidopdf/core';
import type { Margins, PageRef, RenderedPage } from '@vidopdf/core';

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
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const sideways = page.rotation === 90 || page.rotation === 270;
  const [width, height] = sideways
    ? [picture.height, picture.width]
    : [picture.width, picture.height];

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (element === null || context === null || context === undefined) return;
    element.width = width;
    element.height = height;
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate((page.rotation * Math.PI) / 180);
    context.drawImage(picture.image, -picture.width / 2, -picture.height / 2);
    context.restore();
    pixelsRef.current = () => context.getImageData(0, 0, width, height);
  }, [picture, page.rotation, width, height, pixelsRef]);

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
      <canvas ref={canvas} className="crop-canvas" aria-hidden="true" />
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
