import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DPI_MAX, DPI_MIN, IMAGE_FORMATS } from '@vidopdf/core';
import type { ImageFormat } from '@vidopdf/core';
import { useSession } from '../../state/session';
import { useUi } from '../../state/ui-store';

/** Pages times resolution squared, above which a ZIP of pictures gets heavy. Measured guess, refined in the memory benchmark. */
const HEAVY = 400;

function useUsableFormats(): (format: ImageFormat) => boolean {
  const encodable = useSession((state) => state.encodable);
  const { loadEncodableFormats } = useSession.getState();
  useEffect(() => {
    void loadEncodableFormats();
  }, [loadEncodableFormats]);
  // Until the browser has answered, nothing is ruled out. PNG is always there: it is the fallback.
  return (format) => format === 'png' || encodable === undefined || encodable.includes(format);
}

export function ImagesPanel() {
  const { t } = useTranslation();
  const draft = useUi((state) => state.imageDraft);
  const { patchImages } = useUi.getState();
  const workspace = useSession((state) => state.session.workspace);
  const { exportImages } = useSession.getState();
  const usable = useUsableFormats();
  const selected = workspace.selection.length;
  const scope = draft.scope === 'selection' && selected === 0 ? 'all' : draft.scope;
  const count = scope === 'all' ? workspace.pages.length : selected;
  const lossy = draft.format !== 'png';
  const heavy = count * (draft.dpi / 72) ** 2 > HEAVY;

  // A format the browser cannot write must not stay selected.
  useEffect(() => {
    if (!usable(draft.format)) patchImages({ format: 'png' });
  }, [usable, draft.format, patchImages]);

  return (
    <>
      <fieldset>
        <legend>{t('export.images.formatLabel')}</legend>
        {IMAGE_FORMATS.map((format) => (
          <label key={format} className="choice">
            <input
              type="radio"
              name="image-format"
              checked={draft.format === format}
              disabled={!usable(format)}
              onChange={() => {
                patchImages({ format });
              }}
            />
            <span>{t(`export.images.formats.${format}`)}</span>
          </label>
        ))}
        {!usable('webp') && <p className="muted">{t('export.images.webpUnavailable')}</p>}
      </fieldset>

      <label className="field">
        <span>
          {t('export.images.dpiLabel')}:{' '}
          <strong className="mono">{t('export.images.dpiValue', { dpi: draft.dpi })}</strong>
        </span>
        <input
          type="range"
          min={DPI_MIN}
          max={DPI_MAX}
          step={1}
          value={draft.dpi}
          onChange={(event) => {
            patchImages({ dpi: Number(event.target.value) });
          }}
        />
      </label>

      <label className="field">
        <span>
          {t('export.images.qualityLabel')}:{' '}
          <strong className="mono">
            {t('export.images.qualityValue', { percent: Math.round(draft.quality * 100) })}
          </strong>
        </span>
        <input
          type="range"
          min={50}
          max={100}
          step={1}
          disabled={!lossy}
          value={Math.round(draft.quality * 100)}
          onChange={(event) => {
            patchImages({ quality: Number(event.target.value) / 100 });
          }}
        />
      </label>

      <fieldset>
        <legend>{t('export.images.scopeLabel')}</legend>
        <label className="choice">
          <input
            type="radio"
            name="image-scope"
            checked={scope === 'all'}
            onChange={() => {
              patchImages({ scope: 'all' });
            }}
          />
          <span>{t('export.images.scopeAll', { count: workspace.pages.length })}</span>
        </label>
        <label className="choice">
          <input
            type="radio"
            name="image-scope"
            checked={scope === 'selection'}
            disabled={selected === 0}
            onChange={() => {
              patchImages({ scope: 'selection' });
            }}
          />
          <span>{t('export.images.scopeSelection', { count: selected })}</span>
        </label>
      </fieldset>

      <p>{t('export.images.summary', { count })}</p>
      {heavy && <p className="warning">{t('export.images.bigWarning')}</p>}
      <p className="muted">{t('export.images.capNote')}</p>
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={count === 0}
          onClick={() =>
            void exportImages(
              { format: draft.format, dpi: draft.dpi, quality: draft.quality },
              scope,
            )
          }
        >
          {t('export.images.run')}
        </button>
      </div>
    </>
  );
}
