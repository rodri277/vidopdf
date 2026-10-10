import type { Overlay } from '@vidopdf/core';
import { useSession } from '../state/session';

/**
 * The pictures placed on a page (signatures), drawn over it where they will land in the file.
 * Positions are fractions of the page as the reader sees it, so this goes over any box that has
 * that shape: a thumbnail, the preview, the page in the signing dialog.
 */
export function OverlayLayer({ overlays }: { overlays: readonly Overlay[] | undefined }) {
  const assets = useSession((state) => state.assets);
  if (overlays === undefined || overlays.length === 0) return null;
  return (
    <>
      {overlays.map((overlay) => {
        const known = assets[overlay.assetId];
        return known === undefined ? null : (
          <img
            key={overlay.id}
            className="overlay-picture"
            src={known.url}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              left: `${String(overlay.x * 100)}%`,
              top: `${String(overlay.y * 100)}%`,
              width: `${String(overlay.width * 100)}%`,
            }}
          />
        );
      })}
    </>
  );
}
