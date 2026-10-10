import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ANCHORS } from '@vidopdf/core';
import type { Anchor, PageFilter } from '@vidopdf/core';

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
}

/**
 * A number the user can type freely: while the text is not a valid number the stored value is left
 * alone, and an undo that changes the value is shown at once.
 */
export function NumberField({ label, value, min, max, step = 1, onChange }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // The value changed from outside (an undo): show it, unless the text already means it.
    setSeen(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}

interface RangeFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  /** How the value reads next to the label, such as "25 %". */
  readonly display: string;
  readonly onChange: (value: number) => void;
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: RangeFieldProps) {
  return (
    <label className="field">
      <span>
        {label}: <strong className="mono">{display}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
    </label>
  );
}

interface AnchorPickerProps {
  readonly value: Anchor;
  readonly anchors?: readonly Anchor[];
  readonly onChange: (anchor: Anchor) => void;
}

/** The nine places of a page, as a 3 by 3 grid of radio buttons the keyboard can move across. */
export function AnchorPicker({ value, anchors = ANCHORS, onChange }: AnchorPickerProps) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset className="anchor-picker">
      <legend>{t('document.stamp.position')}</legend>
      <div className="anchor-grid" data-count={anchors.length}>
        {ANCHORS.filter((anchor) => anchors.includes(anchor)).map((anchor) => (
          <label key={anchor} className="anchor-cell" data-checked={value === anchor}>
            <input
              type="radio"
              name={name}
              checked={value === anchor}
              onChange={() => {
                onChange(anchor);
              }}
            />
            <span className="visually-hidden">{t(`document.anchors.${anchor}`)}</span>
            <span className="anchor-dot" aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface PagesFieldProps {
  readonly value: PageFilter;
  readonly invalid: boolean;
  readonly onChange: (filter: PageFilter) => void;
}

const FILTERS = ['all', 'odd', 'even', 'ranges'] as const;

export function PagesField({ value, invalid, onChange }: PagesFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="field">
      <label className="field">
        <span>{t('document.stamp.pages')}</span>
        <select
          value={value.kind}
          onChange={(event) => {
            const kind = FILTERS.find((candidate) => candidate === event.target.value) ?? 'all';
            onChange(
              kind === 'ranges'
                ? { kind, text: value.kind === 'ranges' ? value.text : '' }
                : { kind },
            );
          }}
        >
          {FILTERS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`document.stamp.filters.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      {value.kind === 'ranges' && (
        <div className="field">
          <label htmlFor={`${id}-ranges`}>{t('document.stamp.rangesLabel')}</label>
          <input
            id={`${id}-ranges`}
            type="text"
            value={value.text}
            aria-invalid={invalid}
            placeholder="1-3, 5, 8-"
            onChange={(event) => {
              onChange({ kind: 'ranges', text: event.target.value });
            }}
          />
          {invalid && <span role="alert">{t('document.stamp.rangesInvalid')}</span>}
        </div>
      )}
    </div>
  );
}
