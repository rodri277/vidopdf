import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_METADATA_LENGTH, parseKeywords } from '@vidopdf/core';
import { useSession } from '../../state/session';

/** Title, author, subject and keywords of the output. Empty fields are left out of the file. */
export function MetadataPanel() {
  const { t } = useTranslation();
  const metadata = useSession((state) => state.session.workspace.metadata);
  const { setMetadata } = useSession.getState();
  const [keywords, setKeywords] = useState(metadata.keywords.join(', '));
  const [seen, setSeen] = useState(metadata.keywords);
  if (metadata.keywords !== seen) {
    // Changed from outside (an undo): show it, unless what is typed already means the same.
    setSeen(metadata.keywords);
    if (parseKeywords(keywords).join('\u0000') !== metadata.keywords.join('\u0000'))
      setKeywords(metadata.keywords.join(', '));
  }
  const text = (key: 'title' | 'author' | 'subject') => (
    <label className="field">
      <span>
        {t(key === 'title' ? 'document.metadata.titleField' : `document.metadata.${key}`)}
      </span>
      <input
        type="text"
        value={metadata[key]}
        maxLength={MAX_METADATA_LENGTH}
        onChange={(event) => {
          setMetadata({ ...metadata, [key]: event.target.value });
        }}
      />
    </label>
  );
  return (
    <fieldset className="stamp-form">
      <legend>{t('document.metadata.title')}</legend>
      <p className="muted">{t('document.metadata.hint')}</p>
      <div className="stamp-fields">
        {text('title')}
        {text('author')}
        {text('subject')}
        <label className="field">
          <span>{t('document.metadata.keywords')}</span>
          <input
            type="text"
            value={keywords}
            onChange={(event) => {
              setKeywords(event.target.value);
              setMetadata({ ...metadata, keywords: parseKeywords(event.target.value) });
            }}
          />
          <span className="muted">{t('document.metadata.keywordsHint')}</span>
        </label>
      </div>
    </fieldset>
  );
}
