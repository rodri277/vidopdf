import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NO_MARGINS, detectMargins, isCrop, normalizeCrop } from '@vidopdf/core';
import type { Margins } from '@vidopdf/core';
import { useSession } from '../../state/session';
import { useUi } from '../../state/ui-store';
import { NumberField } from '../document/fields';
import { Modal } from '../Modal';
import { usePagePicture } from '../usePagePicture';
import { CropCanvas } from './CropCanvas';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** Margins as the page shows them to the reader, for the selected pages, with a large preview. */
export function CropDialog() {
  const { t } = useTranslation();
  const open = useUi((state) => state.cropOpen);
  const { closeCrop } = useUi.getState();
  const workspace = useSession((state) => state.session.workspace);
  const { cropSelected } = useSession.getState();
  const targets = workspace.pages.filter(
    (page) => page.kind === 'original' && workspace.selection.includes(page.id),
  );
  const page = targets[0];
  const drawn = usePagePicture(page);
  const pixels = useRef<(() => ImageData | undefined) | undefined>(undefined);
  const margins: Margins =
    (page !== undefined ? workspace.edits[page.id]?.crop : undefined) ?? NO_MARGINS;

  return (
    <Modal open={open} labelledBy="crop-title" onClose={closeCrop} className="crop-dialog">
      <h2 id="crop-title">{t('crop.title', { count: targets.length })}</h2>
      <p className="warning">{t('crop.warning')}</p>
      <div className="crop-layout">
        <div className="crop-stage">
          {page !== undefined && drawn.state === 'ready' ? (
            <CropCanvas
              page={page}
              picture={drawn.image}
              margins={margins}
              pixelsRef={pixels}
              onChange={cropSelected}
            />
          ) : (
            <p role="status" className="muted">
              {t(drawn.state === 'failed' ? 'preview.failed' : 'preview.loading')}
            </p>
          )}
        </div>
        <div className="crop-fields">
          {SIDES.map((side) => (
            <NumberField
              key={side}
              label={t(`crop.sides.${side}`)}
              value={Math.round(margins[side] * 1000) / 10}
              min={0}
              max={80}
              step={0.5}
              onChange={(percent) => {
                cropSelected(normalizeCrop({ ...margins, [side]: percent / 100 }));
              }}
            />
          ))}
          <p className="muted">{t('crop.applies', { count: targets.length })}</p>
          <button
            type="button"
            className="btn"
            disabled={drawn.state !== 'ready'}
            onClick={() => {
              const image = pixels.current?.();
              if (image !== undefined)
                cropSelected(detectMargins(image.data, image.width, image.height));
            }}
          >
            {t('crop.detect')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!isCrop(margins)}
            onClick={() => {
              cropSelected(undefined);
            }}
          >
            {t('crop.remove')}
          </button>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={closeCrop}>
          {t('crop.close')}
        </button>
      </div>
    </Modal>
  );
}
