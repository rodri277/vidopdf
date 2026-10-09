import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultImagePageOptions, placeImage } from '@vidopdf/core';
import type { ImagePageOptions, MarginChoice, OrientationChoice, PaperChoice } from '@vidopdf/core';
import { useSession } from '../state/session';
import { Modal } from './Modal';

const PAPERS: readonly PaperChoice[] = ['fit', 'a4', 'letter'];
const ORIENTATIONS: readonly OrientationChoice[] = ['auto', 'portrait', 'landscape'];
const MARGINS: readonly MarginChoice[] = ['none', 'small', 'large'];

/** A wide 4:3 picture stands in for the user's, so the effect of every choice can be seen. */
const SAMPLE = { width: 1600, height: 1200 } as const;
const PREVIEW_BOX = 140;

function SamplePage({ options }: { options: ImagePageOptions }) {
  const { t } = useTranslation();
  const placed = placeImage(SAMPLE.width, SAMPLE.height, options);
  const scale = PREVIEW_BOX / Math.max(placed.pageWidth, placed.pageHeight);
  const pageWidth = placed.pageWidth * scale;
  const pageHeight = placed.pageHeight * scale;
  return (
    <svg
      role="img"
      aria-label={t('importImages.previewLabel')}
      width={PREVIEW_BOX}
      height={PREVIEW_BOX}
      viewBox={`0 0 ${String(PREVIEW_BOX)} ${String(PREVIEW_BOX)}`}
    >
      <g
        transform={`translate(${String((PREVIEW_BOX - pageWidth) / 2)} ${String((PREVIEW_BOX - pageHeight) / 2)})`}
      >
        <rect width={pageWidth} height={pageHeight} fill="#fff" stroke="var(--border)" />
        <rect
          x={placed.x * scale}
          y={(placed.pageHeight - placed.y - placed.height) * scale}
          width={placed.width * scale}
          height={placed.height * scale}
          fill="var(--accent)"
        />
      </g>
    </svg>
  );
}

function Choice<T extends string>({
  name,
  legend,
  values,
  value,
  label,
  onChange,
}: {
  name: string;
  legend: ReactNode;
  values: readonly T[];
  value: T;
  label: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {values.map((option) => (
        <label key={option} className="choice">
          <input
            type="radio"
            name={name}
            checked={value === option}
            onChange={() => {
              onChange(option);
            }}
          />
          <span>{label(option)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Asked once for all the pictures dropped together: how each becomes a PDF page. */
export function ImageImportDialog() {
  const { t } = useTranslation();
  const pending = useSession((state) => state.pendingImages);
  const { addImages, discardImages } = useSession.getState();
  const [options, setOptions] = useState<ImagePageOptions>(defaultImagePageOptions);
  const patch = (changes: Partial<ImagePageOptions>) => {
    setOptions((current) => ({ ...current, ...changes }));
  };

  return (
    <Modal
      open={pending.length > 0}
      labelledBy="import-title"
      onClose={discardImages}
      className="import-dialog"
    >
      <h2 id="import-title">{t('importImages.title')}</h2>
      <p>{t('importImages.intro', { count: pending.length })}</p>
      <div className="import-grid">
        <div>
          <Choice
            name="paper"
            legend={t('importImages.paperLabel')}
            values={PAPERS}
            value={options.paper}
            label={(v) => t(`importImages.paper.${v}`)}
            onChange={(paper) => {
              patch({ paper });
            }}
          />
          <Choice
            name="orientation"
            legend={t('importImages.orientationLabel')}
            values={ORIENTATIONS}
            value={options.orientation}
            label={(v) => t(`importImages.orientation.${v}`)}
            onChange={(orientation) => {
              patch({ orientation });
            }}
          />
          <Choice
            name="margin"
            legend={t('importImages.marginLabel')}
            values={MARGINS}
            value={options.margin}
            label={(v) => t(`importImages.margin.${v}`)}
            onChange={(margin) => {
              patch({ margin });
            }}
          />
        </div>
        <div className="import-preview">
          <SamplePage options={options} />
        </div>
      </div>
      <p className="muted">{t('importImages.exifNote')}</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={discardImages}>
          {t('importImages.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the one action this dialog exists for
          autoFocus
          onClick={() => void addImages(options)}
        >
          {t('importImages.add')}
        </button>
      </div>
    </Modal>
  );
}
