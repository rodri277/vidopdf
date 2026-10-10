import { useTranslation } from 'react-i18next';
import { presets } from '@vidopdf/core';
import type { Anchor } from '@vidopdf/core';
import { TextStampForm } from './TextStampForm';

const TOP: readonly Anchor[] = ['topLeft', 'topCenter', 'topRight'];
const BOTTOM: readonly Anchor[] = ['bottomLeft', 'bottomCenter', 'bottomRight'];

/** Page numbers, a header and a footer: three stamps of text with tokens for the page. */
export function NumberingPanel() {
  const { t } = useTranslation();
  const formats = [
    { id: 'plain', template: '{n}' },
    { id: 'ofTotal', template: '{n} / {total}' },
    { id: 'words', template: t('document.numbering.wordsTemplate') },
    { id: 'roman', template: '{n:roman}' },
    { id: 'ROMAN', template: '{n:ROMAN}' },
  ] as const;
  return (
    <>
      <TextStampForm
        slot="pageNumber"
        title={t('document.numbering.title')}
        create={presets.pageNumber}
        show={{ startAt: true, skipFirst: true, bold: true }}
      >
        {(stamp, patch) => (
          <label className="field">
            <span>{t('document.numbering.format')}</span>
            <select
              value={formats.find((format) => format.template === stamp.template)?.id ?? 'custom'}
              onChange={(event) => {
                const chosen = formats.find((format) => format.id === event.target.value);
                if (chosen !== undefined) patch({ template: chosen.template });
              }}
            >
              {formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {t(`document.numbering.formats.${format.id}`)}
                </option>
              ))}
              <option value="custom">{t('document.numbering.formats.custom')}</option>
            </select>
          </label>
        )}
      </TextStampForm>
      <TextStampForm
        slot="header"
        title={t('document.header.title')}
        create={presets.header}
        anchors={TOP}
        show={{ skipFirst: true }}
      />
      <TextStampForm
        slot="footer"
        title={t('document.footer.title')}
        create={presets.footer}
        anchors={BOTTOM}
        show={{ skipFirst: true }}
      />
    </>
  );
}
