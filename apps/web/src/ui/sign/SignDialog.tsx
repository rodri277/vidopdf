import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { keepOverlayInside } from '@vidopdf/core';
import type { Overlay, PageRef } from '@vidopdf/core';
import { useSession } from '../../state/session';
import type { AssetInfo } from '../../state/session-store';
import { useUi } from '../../state/ui-store';
import { RangeField } from '../document/fields';
import { Modal } from '../Modal';
import { PageCanvas } from '../PageCanvas';
import { usePagePicture } from '../usePagePicture';
import { SignatureMaker } from './SignatureMaker';

const STEP = 0.01;
const NONE: readonly Overlay[] = [];

function keyChange(overlay: Overlay, key: string, fast: boolean): Partial<Overlay> | undefined {
  const step = fast ? STEP * 5 : STEP;
  const changes: Record<string, Partial<Overlay>> = {
    ArrowLeft: { x: overlay.x - step },
    ArrowRight: { x: overlay.x + step },
    ArrowUp: { y: overlay.y - step },
    ArrowDown: { y: overlay.y + step },
    '+': { width: overlay.width + 0.02 },
    '-': { width: overlay.width - 0.02 },
  };
  return changes[key];
}

/** The page with the signatures over it: drag them, or move them with the keyboard. */
function Placement({ page }: { page: Extract<PageRef, { kind: 'original' }> }) {
  const { t } = useTranslation();
  const placed = useSession((state) => state.session.workspace.edits[page.id]?.overlays);
  // A constant, not a new array on every read, or the store would see a change on every render.
  const overlays = placed ?? NONE;
  const assets = useSession((state) => state.assets);
  const { placeSignature, removeSignature } = useSession.getState();
  const drawn = usePagePicture(page);
  const frame = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number } | undefined>(undefined);

  const update = (overlay: Overlay, changes: Partial<Overlay>) => {
    const box = frame.current?.getBoundingClientRect();
    const view = { width: box?.width ?? 1, height: box?.height ?? 1 };
    placeSignature(page.id, keepOverlayInside({ ...overlay, ...changes }, view));
  };
  const fraction = (event: PointerEvent<HTMLButtonElement>) => {
    const box = frame.current?.getBoundingClientRect();
    return box === undefined
      ? undefined
      : { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };
  const onPointerDown = (overlay: Overlay) => (event: PointerEvent<HTMLButtonElement>) => {
    const at = fraction(event);
    if (at === undefined) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = { dx: at.x - overlay.x, dy: at.y - overlay.y };
  };
  const onPointerMove = (overlay: Overlay) => (event: PointerEvent<HTMLButtonElement>) => {
    const at = fraction(event);
    const start = grab.current;
    if (at === undefined || start === undefined || event.buttons === 0) return;
    update(overlay, { x: at.x - start.dx, y: at.y - start.dy });
  };
  const onKeyDown = (overlay: Overlay) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSignature(page.id, overlay.id);
      return;
    }
    const change = keyChange(overlay, event.key, event.shiftKey);
    if (change === undefined) return;
    event.preventDefault();
    update(overlay, change);
  };

  if (drawn.state !== 'ready') {
    return (
      <p role="status" className="muted">
        {t(drawn.state === 'failed' ? 'preview.failed' : 'preview.loading')}
      </p>
    );
  }
  return (
    <div className="sign-frame" ref={frame}>
      <PageCanvas page={page} picture={drawn.image} className="sign-canvas" />
      {overlays.map((overlay) => {
        const known = assets[overlay.assetId];
        if (known === undefined) return null;
        return (
          <button
            key={overlay.id}
            type="button"
            className="sign-item"
            aria-label={t('sign.item')}
            style={{
              left: `${String(overlay.x * 100)}%`,
              top: `${String(overlay.y * 100)}%`,
              width: `${String(overlay.width * 100)}%`,
            }}
            onPointerDown={onPointerDown(overlay)}
            onPointerMove={onPointerMove(overlay)}
            onPointerUp={() => {
              grab.current = undefined;
            }}
            onKeyDown={onKeyDown(overlay)}
          >
            <img src={known.url} alt="" draggable={false} />
          </button>
        );
      })}
    </div>
  );
}

/** Put the current signature on the page, take it off, and change its size. */
function PlaceActions({
  page,
  asset,
}: {
  page: PageRef | undefined;
  asset: AssetInfo | undefined;
}) {
  const { t } = useTranslation();
  const overlays = useSession((state) =>
    page === undefined ? undefined : state.session.workspace.edits[page.id]?.overlays,
  );
  const { placeSignature, removeSignature } = useSession.getState();
  const mine = overlays?.find((overlay) => overlay.assetId === asset?.id);
  const signable = page?.kind === 'original';
  return (
    <>
      <div className="field-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={asset === undefined || !signable || mine !== undefined}
          onClick={() => {
            if (asset === undefined || page === undefined) return;
            placeSignature(page.id, {
              id: `${asset.id}-${page.id}`,
              assetId: asset.id,
              x: 0.55,
              y: 0.8,
              width: 0.3,
              aspect: asset.aspect,
            });
          }}
        >
          {t('sign.place')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={mine === undefined}
          onClick={() => {
            if (page !== undefined && mine !== undefined) removeSignature(page.id, mine.id);
          }}
        >
          {t('sign.remove')}
        </button>
      </div>
      {mine !== undefined && page !== undefined && (
        <RangeField
          label={t('sign.size')}
          value={Math.round(mine.width * 100)}
          min={5}
          max={80}
          display={`${String(Math.round(mine.width * 100))} %`}
          onChange={(percent) => {
            placeSignature(
              page.id,
              keepOverlayInside({ ...mine, width: percent / 100 }, { width: 1, height: 1.4 }),
            );
          }}
        />
      )}
    </>
  );
}

/** Signs pages with a drawn, typed or imported picture. It is a visual signature, and says so. */
export function SignDialog() {
  const { t } = useTranslation();
  const open = useUi((state) => state.signOpen);
  const { closeSign } = useUi.getState();
  const pages = useSession((state) => state.session.workspace.pages);
  const [asset, setAsset] = useState<AssetInfo | undefined>();
  const [index, setIndex] = useState(() => {
    const { workspace } = useSession.getState().session;
    const first = pages.findIndex(
      (page) => page.kind === 'original' && workspace.selection.includes(page.id),
    );
    return Math.max(0, first);
  });
  const page = pages[index];
  const goTo = (to: number) => {
    setIndex(Math.max(0, Math.min(pages.length - 1, to)));
  };

  return (
    <Modal open={open} labelledBy="sign-title" onClose={closeSign} className="sign-dialog">
      <h2 id="sign-title">{t('sign.title')}</h2>
      <p className="warning">{t('sign.notice')}</p>
      <div className="sign-layout">
        <div className="sign-controls">
          <SignatureMaker onCreated={setAsset} />
          {asset !== undefined && (
            <div className="field">
              <span>{t('sign.current')}</span>
              <img className="asset-thumb" src={asset.url} alt={asset.name} />
            </div>
          )}
        </div>
        <div className="sign-stage">
          <div className="field-row">
            <button
              type="button"
              className="btn btn-small"
              disabled={index <= 0}
              onClick={() => {
                goTo(index - 1);
              }}
            >
              {t('preview.previous')}
            </button>
            <span className="mono">
              {t('preview.title', { n: index + 1, total: pages.length })}
            </span>
            <button
              type="button"
              className="btn btn-small"
              disabled={index >= pages.length - 1}
              onClick={() => {
                goTo(index + 1);
              }}
            >
              {t('preview.next')}
            </button>
          </div>
          {page?.kind === 'blank' && <p className="muted">{t('sign.blank')}</p>}
          {page?.kind === 'original' && <Placement key={page.id} page={page} />}
          <PlaceActions page={page} asset={asset} />
          <p className="muted">{t('sign.moveHint')}</p>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={closeSign}>
          {t('sign.close')}
        </button>
      </div>
    </Modal>
  );
}
