import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { presets } from '@vidopdf/core';
import type { ImageStamp } from '@vidopdf/core';
import { useSession } from '../../state/session';
import type { AssetProblem } from '../../state/session-store';
import { AnchorPicker, PagesField, RangeField } from './fields';
import { TextStampForm } from './TextStampForm';

type Mode = 'off' | 'text' | 'image';

function ImageForm({ stamp }: { stamp: ImageStamp }) {
  const { t } = useTranslation();
  const { setStamp, addAsset, removeAsset } = useSession.getState();
  const asset = useSession((state) => state.assets[stamp.assetId]);
  const [problem, setProblem] = useState<AssetProblem | undefined>();
  const input = useRef<HTMLInputElement>(null);
  const patch = (changes: Partial<ImageStamp>) => {
    setStamp('watermark', { ...stamp, ...changes });
  };
  return (
    <div className="stamp-fields">
      <div className="field">
        <span>{t('document.watermark.picture')}</span>
        <div className="field-row">
          {asset !== undefined && <img className="asset-thumb" src={asset.url} alt={asset.name} />}
          <button
            type="button"
            className="btn"
            onClick={() => {
              input.current?.click();
            }}
          >
            {t(asset === undefined ? 'document.watermark.choose' : 'document.watermark.change')}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          data-testid="watermark-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file === undefined) return;
            void addAsset(file).then((result) => {
              if (typeof result === 'string') {
                setProblem(result);
                return;
              }
              setProblem(undefined);
              if (asset !== undefined) removeAsset(asset.id);
              patch({ assetId: result.id, aspect: result.aspect });
            });
          }}
        />
        {problem !== undefined && (
          <span role="alert">{t(`document.watermark.problems.${problem}`)}</span>
        )}
      </div>
      <AnchorPicker
        value={stamp.anchor}
        onChange={(anchor) => {
          patch({ anchor });
        }}
      />
      <RangeField
        label={t('document.watermark.width')}
        value={Math.round(stamp.width)}
        min={30}
        max={560}
        step={5}
        display={`${String(Math.round(stamp.width))} pt`}
        onChange={(width) => {
          patch({ width });
        }}
      />
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
      <PagesField
        value={stamp.pages}
        invalid={false}
        onChange={(pages) => {
          patch({ pages });
        }}
      />
    </div>
  );
}

/** A text or picture laid over every page (or some), faded so what is under it can still be read. */
export function WatermarkPanel() {
  const { t } = useTranslation();
  const name = useId();
  const stamp = useSession((state) =>
    state.session.workspace.stamps.find((candidate) => candidate.id === 'watermark'),
  );
  const { setStamp } = useSession.getState();
  const mode: Mode = stamp === undefined ? 'off' : stamp.kind;
  const choose = (next: Mode) => {
    if (next === 'off') setStamp('watermark', null);
    else if (next === 'text')
      setStamp('watermark', presets.watermark('watermark', t('document.watermark.defaultText')));
    else
      setStamp('watermark', {
        kind: 'image',
        id: 'watermark',
        assetId: '',
        anchor: 'center',
        margin: 0,
        opacity: 0.3,
        rotation: 0,
        pages: { kind: 'all' },
        skipFirst: false,
        width: 240,
        aspect: 1,
      });
  };
  return (
    <fieldset className="stamp-form">
      <legend>{t('document.watermark.title')}</legend>
      <div role="radiogroup" aria-label={t('document.watermark.kind')} className="choices">
        {(['off', 'text', 'image'] as const).map((kind) => (
          <label key={kind} className="choice">
            <input
              type="radio"
              name={name}
              checked={mode === kind}
              onChange={() => {
                choose(kind);
              }}
            />
            <span>{t(`document.watermark.kinds.${kind}`)}</span>
          </label>
        ))}
      </div>
      <p className="muted">{t('document.watermark.hint')}</p>
      {stamp?.kind === 'image' && <ImageForm stamp={stamp} />}
      {stamp?.kind === 'text' && (
        <TextStampForm
          slot="watermark"
          title={t('document.watermark.textTitle')}
          bare
          create={(id) => presets.watermark(id, t('document.watermark.defaultText'))}
          show={{ opacity: true, rotation: true, bold: true }}
        />
      )}
    </fieldset>
  );
}
