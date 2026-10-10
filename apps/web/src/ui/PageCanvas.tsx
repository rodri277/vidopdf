import { useEffect, useRef } from 'react';
import type { PageRef, RenderedPage } from '@vidopdf/core';

interface Props {
  readonly page: PageRef;
  readonly picture: RenderedPage<ImageBitmap>;
  readonly className?: string;
  /** Gives the pixels of the picture, as the reader sees it, to whoever asks (to find margins). */
  readonly pixelsRef?: { current: (() => ImageData | undefined) | undefined };
}

/**
 * A page picture drawn the way the reader sees it: the quarter turn the user gave the page is
 * applied while drawing, so a layer placed over the canvas works in the reader's own view.
 */
export function PageCanvas({ page, picture, className, pixelsRef }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
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
    if (pixelsRef !== undefined)
      pixelsRef.current = () => context.getImageData(0, 0, width, height);
  }, [picture, page.rotation, width, height, pixelsRef]);

  return <canvas ref={canvas} className={className} aria-hidden="true" />;
}
