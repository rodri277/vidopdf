import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { displaySize, placeStamp, renderTemplate, renderKey, stampsFor } from '@vidopdf/core';
import type { PageRef, Stamp } from '@vidopdf/core';
import { useSession } from '../../state/session';
import { useThumbnail } from '../../thumbnails/thumbnails';
import { PageFace, fit } from '../PageCard';
import { LINE_HEIGHT, measureText } from './measure';

const BOX = { width: 300, height: 400 };

interface Props {
  /** Zero-based position of the page in the output. */
  readonly index: number;
}

function usePoints(page: PageRef | undefined) {
  const thumbnail = useThumbnail(page === undefined ? 'none' : renderKey(page));
  if (page === undefined) return undefined;
  if (page.kind === 'blank') return { width: page.width, height: page.height };
  return thumbnail === undefined
    ? undefined
    : { width: thumbnail.pointsWidth, height: thumbnail.pointsHeight };
}

function StampLayer({
  stamps,
  index,
  total,
  size,
  scale,
  fileName,
}: {
  stamps: readonly Stamp[];
  index: number;
  total: number;
  size: { width: number; height: number };
  scale: number;
  fileName: string;
}) {
  const assets = useSession((state) => state.assets);
  const date = new Date().toLocaleDateString('sv-SE');
  return (
    <div className="stamp-layer" aria-hidden="true">
      {stamps.map((stamp) => {
        if (stamp.kind === 'text') {
          const text = renderTemplate(stamp.template, {
            n: index + stamp.startAt,
            total,
            file: fileName,
            date,
          });
          const box = {
            width: measureText(text, stamp.fontSize, stamp.bold),
            height: stamp.fontSize * LINE_HEIGHT,
          };
          const placed = placeStamp(stamp, size, box);
          return (
            <span
              key={stamp.id}
              className="stamp-text"
              style={{
                left: placed.center.x * scale,
                top: placed.center.y * scale,
                fontSize: stamp.fontSize * scale,
                fontWeight: stamp.bold ? 700 : 400,
                color: stamp.color,
                opacity: stamp.opacity,
                transform: `translate(-50%, -50%) rotate(${String(-placed.angle)}deg)`,
              }}
            >
              {text}
            </span>
          );
        }
        const asset = assets[stamp.assetId];
        if (asset === undefined) return null;
        const box = { width: stamp.width, height: stamp.width * asset.aspect };
        const placed = placeStamp(stamp, size, box);
        return (
          <img
            key={stamp.id}
            className="stamp-image"
            src={asset.url}
            alt=""
            style={{
              left: placed.center.x * scale,
              top: placed.center.y * scale,
              width: box.width * scale,
              height: box.height * scale,
              opacity: stamp.opacity,
              transform: `translate(-50%, -50%) rotate(${String(-placed.angle)}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * One page with the stamps drawn over it. Positions come from the same functions the writer uses,
 * on the page's real size in points, so what is shown is what the file will have.
 */
export function StampPreview({ index }: Props) {
  const { t } = useTranslation();
  const pages = useSession((state) => state.session.workspace.pages);
  const stamps = useSession((state) => state.session.workspace.stamps);
  const sources = useSession((state) => state.session.workspace.sources);
  const page = pages[Math.min(Math.max(index, 0), pages.length - 1)];
  const points = usePoints(page);
  const shown = useMemo(
    () => (page === undefined ? [] : stampsFor(stamps, index, pages.length)),
    [stamps, index, pages.length, page],
  );
  if (page === undefined) return null;
  const display = points === undefined ? undefined : displaySize(points, page.rotation);
  const frame = fit(
    display === undefined ? 3 / 4 : display.width / display.height,
    BOX.width,
    BOX.height,
  );
  const only =
    sources.length === 1 ? (sources[0]?.name.replace(/\.pdf$/i, '') ?? 'vidopdf') : 'vidopdf';
  return (
    <figure className="stamp-preview" aria-label={t('document.previewLabel', { n: index + 1 })}>
      <div className="stamp-preview-page" style={{ width: frame.width, height: frame.height }}>
        <PageFace page={page} boxWidth={BOX.width} boxHeight={BOX.height} />
        {display !== undefined && (
          <StampLayer
            stamps={shown}
            index={index}
            total={pages.length}
            size={display}
            scale={frame.width / display.width}
            fileName={`${only}.pdf`}
          />
        )}
      </div>
      <figcaption className="muted">
        {t('document.previewCaption', { n: index + 1, total: pages.length })}
      </figcaption>
    </figure>
  );
}
