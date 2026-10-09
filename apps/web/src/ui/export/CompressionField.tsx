import { useTranslation } from 'react-i18next';
import { COMPRESSION_PRESETS } from '@vidopdf/core';
import { useSession } from '../../state/session';
import type { CompressionChoice } from '../../state/session-store';

const CHOICES: readonly CompressionChoice[] = ['off', ...COMPRESSION_PRESETS];

/** The one place to choose how much the pictures inside the exported PDFs are shrunk. */
export function CompressionField() {
  const { t } = useTranslation();
  const choice = useSession((state) => state.compression);
  const { setCompression } = useSession.getState();
  return (
    <fieldset>
      <legend>{t('export.compression.legend')}</legend>
      {CHOICES.map((value) => (
        <label key={value} className="choice">
          <input
            type="radio"
            name="compression"
            checked={choice === value}
            onChange={() => {
              setCompression(value);
            }}
          />
          <span>{t(`export.compression.${value}`)}</span>
        </label>
      ))}
      <p className="muted">{t('export.compression.hint')}</p>
    </fieldset>
  );
}
