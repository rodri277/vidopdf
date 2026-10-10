import { useTranslation } from 'react-i18next';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, stampProblems } from '@vidopdf/core';
import type { Anchor, StampProblem, TextStamp } from '@vidopdf/core';
import { useSession } from '../../state/session';
import type { StampSlot } from '../../state/session-store';
import { AnchorPicker, NumberField, PagesField, RangeField } from './fields';

export interface TextStampFormProps {
  readonly slot: StampSlot;
  readonly title: string;
  /** Leave out the legend and the switch: another control already decides whether the stamp exists. */
  readonly bare?: boolean;
  readonly create: (id: string) => TextStamp;
  readonly anchors?: readonly Anchor[];
  readonly show: {
    readonly startAt?: boolean;
    readonly skipFirst?: boolean;
    readonly opacity?: boolean;
    readonly rotation?: boolean;
    readonly bold?: boolean;
  };
  /** Extra controls above the text (the number format). */
  readonly children?: (
    stamp: TextStamp,
    patch: (changes: Partial<TextStamp>) => void,
  ) => React.ReactNode;
}

interface PartProps {
  readonly stamp: TextStamp;
  readonly show: TextStampFormProps['show'];
  readonly patch: (changes: Partial<TextStamp>) => void;
}

function StyleFields({ stamp, show, patch }: PartProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="field-row">
        <NumberField
          label={t('document.stamp.size')}
          value={stamp.fontSize}
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          onChange={(fontSize) => {
            patch({ fontSize });
          }}
        />
        <label className="field">
          <span>{t('document.stamp.color')}</span>
          <input
            type="color"
            value={stamp.color}
            onChange={(event) => {
              patch({ color: event.target.value });
            }}
          />
        </label>
      </div>
      {show.bold === true && (
        <label className="choice">
          <input
            type="checkbox"
            checked={stamp.bold}
            onChange={(event) => {
              patch({ bold: event.target.checked });
            }}
          />
          <span>{t('document.stamp.bold')}</span>
        </label>
      )}
    </>
  );
}

function OptionFields({ stamp, show, patch }: PartProps) {
  const { t } = useTranslation();
  return (
    <>
      {show.startAt === true && (
        <NumberField
          label={t('document.stamp.startAt')}
          value={stamp.startAt}
          min={-9999}
          max={999999}
          onChange={(startAt) => {
            patch({ startAt });
          }}
        />
      )}
      {show.opacity === true && (
        <RangeField
          label={t('document.stamp.opacity')}
          value={Math.round(stamp.opacity * 100)}
          min={5}
          max={100}
          display={`${String(Math.round(stamp.opacity * 100))} %`}
          onChange={(percent) => {
            patch({ opacity: percent / 100 });
          }}
        />
      )}
      {show.rotation === true && (
        <RangeField
          label={t('document.stamp.rotation')}
          value={stamp.rotation}
          min={-90}
          max={90}
          step={5}
          display={`${String(stamp.rotation)}°`}
          onChange={(rotation) => {
            patch({ rotation });
          }}
        />
      )}
      {show.skipFirst === true && (
        <label className="choice">
          <input
            type="checkbox"
            checked={stamp.skipFirst}
            onChange={(event) => {
              patch({ skipFirst: event.target.checked });
            }}
          />
          <span>{t('document.stamp.skipFirst')}</span>
        </label>
      )}
    </>
  );
}

interface StampFieldsProps extends PartProps {
  readonly anchors: readonly Anchor[] | undefined;
  readonly problems: readonly StampProblem[];
  readonly children: TextStampFormProps['children'];
}

function StampFields({ stamp, patch, anchors, show, problems, children }: StampFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className="stamp-fields">
      {children?.(stamp, patch)}
      <div className="field">
        <label htmlFor={`${stamp.id}-text`}>{t('document.stamp.text')}</label>
        <input
          id={`${stamp.id}-text`}
          type="text"
          value={stamp.template}
          aria-invalid={problems.includes('template')}
          aria-describedby={`${stamp.id}-tokens`}
          maxLength={300}
          onChange={(event) => {
            patch({ template: event.target.value });
          }}
        />
        <span id={`${stamp.id}-tokens`} className="muted">
          {t('document.stamp.tokens')}
        </span>
        {problems.includes('template') && <span role="alert">{t('document.stamp.textEmpty')}</span>}
      </div>
      <AnchorPicker
        value={stamp.anchor}
        {...(anchors === undefined ? {} : { anchors })}
        onChange={(anchor) => {
          patch({ anchor });
        }}
      />
      <StyleFields stamp={stamp} show={show} patch={patch} />
      <OptionFields stamp={stamp} show={show} patch={patch} />
      <PagesField
        value={stamp.pages}
        invalid={problems.includes('ranges')}
        onChange={(pages) => {
          patch({ pages });
        }}
      />
    </div>
  );
}

function EnableSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <label className="choice">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span>{t('document.stamp.enable')}</span>
    </label>
  );
}

/** The form of one stamp that is text: switched on and off, and every setting while it is on. */
export function TextStampForm({
  slot,
  title,
  bare = false,
  create,
  anchors,
  show,
  children,
}: TextStampFormProps) {
  const found = useSession((state) =>
    state.session.workspace.stamps.find((candidate) => candidate.id === slot),
  );
  const stamp = found?.kind === 'text' ? found : undefined;
  const { setStamp } = useSession.getState();
  const problems = stamp === undefined ? [] : stampProblems(stamp);
  const patch = (changes: Partial<TextStamp>) => {
    if (stamp !== undefined)
      setStamp(slot, { ...stamp, ...changes }, Object.keys(changes).join(','));
  };
  return (
    <fieldset className="stamp-form" data-bare={bare}>
      {!bare && <legend>{title}</legend>}
      {!bare && (
        <EnableSwitch
          on={stamp !== undefined}
          onChange={(on) => {
            setStamp(slot, on ? create(slot) : null);
          }}
        />
      )}
      {stamp !== undefined && (
        <StampFields stamp={stamp} patch={patch} anchors={anchors} show={show} problems={problems}>
          {children}
        </StampFields>
      )}
    </fieldset>
  );
}
