import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LENGTH_UNITS,
  LOW_DPI,
  MAX_PAGE_POINTS,
  MIN_PAGE_POINTS,
  defaultImagePageOptions,
  effectiveDpi,
  formatLength,
  pageSizeProblem,
  placeImage,
  toPoints,
} from '@vidopdf/core';
import type {
  ImagePageOptions,
  ImageSize,
  LengthUnit,
  MarginChoice,
  OrientationChoice,
  PaperChoice,
} from '@vidopdf/core';
import { useSession } from '../state/session';
import type { PendingImage } from '../state/session-store';
import { Modal } from './Modal';

const PAPERS: readonly PaperChoice[] = ['fit', 'a4', 'letter', 'custom'];
const ORIENTATIONS: readonly OrientationChoice[] = ['auto', 'portrait', 'landscape'];
const MARGINS: readonly MarginChoice[] = ['none', 'small', 'large'];

/** A wide 4:3 picture stands in for the user's, so the effect of every choice can be seen. */
const SAMPLE = { width: 1600, height: 1200 } as const;
const PREVIEW_BOX = 140;

/** Most rows of the summary shown at once; the rest are counted. */
const SUMMARY_ROWS = 5;

function SamplePage({
  options,
  image,
  name,
}: {
  options: ImagePageOptions;
  image: ImageSize;
  name: string | undefined;
}) {
  const { t } = useTranslation();
  const placed = placeImage(image.width, image.height, options);
  const scale = PREVIEW_BOX / Math.max(placed.pageWidth, placed.pageHeight);
  const pageWidth = placed.pageWidth * scale;
  const pageHeight = placed.pageHeight * scale;
  return (
    <svg
      role="img"
      aria-label={
        name === undefined ? t('importImages.previewLabel') : t('importImages.previewOf', { name })
      }
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

/** A number typed in a field; a comma works as the decimal point. */
function parseLength(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

const shown = formatLength;

/** The width and height of a page of the user's own, typed in the unit they prefer. */
function CustomSizeFields({
  options,
  unit,
  onUnit,
  onChange,
}: {
  options: ImagePageOptions;
  unit: LengthUnit;
  onUnit: (unit: LengthUnit) => void;
  onChange: (custom: ImagePageOptions['custom']) => void;
}) {
  const { t } = useTranslation();
  const [texts, setTexts] = useState({
    width: shown(options.custom.width, unit),
    height: shown(options.custom.height, unit),
  });
  const typed = { width: parseLength(texts.width), height: parseLength(texts.height) };
  const problem = pageSizeProblem({
    width: toPoints(typed.width, unit),
    height: toPoints(typed.height, unit),
  });
  const edit = (side: 'width' | 'height', text: string) => {
    const next = { ...texts, [side]: text };
    setTexts(next);
    onChange({
      width: toPoints(parseLength(next.width), unit),
      height: toPoints(parseLength(next.height), unit),
    });
  };
  const field = (side: 'width' | 'height') => (
    <label className="field">
      <span>{t(`importImages.custom.${side}`)}</span>
      <input
        type="text"
        inputMode="decimal"
        value={texts[side]}
        aria-invalid={problem !== undefined}
        onChange={(event) => {
          edit(side, event.target.value);
        }}
      />
    </label>
  );
  return (
    <fieldset>
      <div className="field-row">
        {field('width')}
        {field('height')}
        <label className="field">
          <span>{t('importImages.custom.unit')}</span>
          <select
            value={unit}
            onChange={(event) => {
              const next = event.target.value as LengthUnit;
              onUnit(next);
              // What is typed is converted, so the page keeps its size; unreadable text stays.
              const convert = (text: string) => {
                const value = parseLength(text);
                return Number.isFinite(value) ? shown(toPoints(value, unit), next) : text;
              };
              setTexts({ width: convert(texts.width), height: convert(texts.height) });
            }}
          >
            {LENGTH_UNITS.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>
      </div>
      {problem === undefined ? (
        <p className="muted">{t('importImages.custom.note')}</p>
      ) : (
        <p role="alert">
          {t(`importImages.custom.${problem}`, {
            min: formatLength(MIN_PAGE_POINTS, unit),
            max: formatLength(MAX_PAGE_POINTS, unit),
            unit,
          })}
        </p>
      )}
    </fieldset>
  );
}

/** What each picture will get: the size of its page and the resolution it will have on it. */
function Summary({
  images,
  options,
  unit,
}: {
  images: readonly PendingImage[];
  options: ImagePageOptions;
  unit: LengthUnit;
}) {
  const { t } = useTranslation();
  const rows = images.slice(0, SUMMARY_ROWS).map(({ id, file, size }) => {
    if (size === undefined)
      return <li key={id}>{t('importImages.summaryNoSize', { name: file.name })}</li>;
    const placed = placeImage(size.width, size.height, options);
    const dpi = Math.round(effectiveDpi(size.width, placed));
    return (
      <li key={id}>
        {t('importImages.summaryRow', {
          name: file.name,
          pixels: `${String(size.width)} × ${String(size.height)}`,
          page: `${formatLength(placed.pageWidth, unit)} × ${formatLength(placed.pageHeight, unit)}`,
          unit,
          dpi,
        })}
        {dpi < LOW_DPI && <strong> — {t('importImages.lowDpi')}</strong>}
      </li>
    );
  });
  return (
    <section aria-labelledby="import-summary">
      <h3 id="import-summary" className="import-summary-title">
        {t('importImages.summaryTitle')}
      </h3>
      <ul className="import-summary">
        {rows}
        {images.length > SUMMARY_ROWS && (
          <li>{t('importImages.summaryMore', { count: images.length - SUMMARY_ROWS })}</li>
        )}
      </ul>
    </section>
  );
}

/** Asked once for all the pictures dropped together: how each becomes a PDF page. */
export function ImageImportDialog() {
  const { t } = useTranslation();
  const pending = useSession((state) => state.pendingImages);
  const { addImages, discardImages } = useSession.getState();
  const [options, setOptions] = useState<ImagePageOptions>(defaultImagePageOptions);
  const [unit, setUnit] = useState<LengthUnit>('mm');
  const patch = (changes: Partial<ImagePageOptions>) => {
    setOptions((current) => ({ ...current, ...changes }));
  };

  const custom = options.paper === 'custom';
  const invalid = custom && pageSizeProblem(options.custom) !== undefined;
  const sample = pending.find((image) => image.size !== undefined);
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
          {custom && (
            <CustomSizeFields
              options={options}
              unit={unit}
              onUnit={setUnit}
              onChange={(size) => {
                patch({ custom: size });
              }}
            />
          )}
          {!custom && (
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
          )}
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
          <SamplePage options={options} image={sample?.size ?? SAMPLE} name={sample?.file.name} />
        </div>
      </div>
      <Summary images={pending} options={options} unit={unit} />
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
          disabled={invalid}
          onClick={() => void addImages(options)}
        >
          {t('importImages.add')}
        </button>
      </div>
    </Modal>
  );
}
