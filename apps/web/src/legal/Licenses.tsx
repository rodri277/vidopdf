import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import licenses from './licenses.json';
import { REPOSITORY_URL } from './types';

/** The full texts are one file served with the site; they are fetched only if someone opens them. */
function FullTexts() {
  const { t } = useTranslation();
  const [text, setText] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  return (
    <details
      onToggle={(event) => {
        if (!event.currentTarget.open || text !== undefined) return;
        fetch('/THIRD_PARTY_LICENSES.txt')
          .then((response) =>
            response.ok ? response.text() : Promise.reject(new Error('missing')),
          )
          .then(setText)
          .catch(() => {
            setFailed(true);
          });
      }}
    >
      <summary>{t('legal.licenses.fullTexts')}</summary>
      {failed && <p role="alert">{t('legal.licenses.fullTextsFailed')}</p>}
      {text === undefined && !failed && <p className="muted">{t('legal.licenses.loading')}</p>}
      {text !== undefined && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable with the keyboard
        <pre className="license-text" tabIndex={0}>
          {text}
        </pre>
      )}
    </details>
  );
}

export function Licenses() {
  const { t } = useTranslation();
  return (
    <>
      <p>{t('legal.licenses.intro')}</p>
      <p>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          {t('legal.licenses.source')}
        </a>
      </p>

      <section>
        <h3>{t('legal.licenses.packages')}</h3>
        <table className="license-table">
          <thead>
            <tr>
              <th scope="col">{t('legal.licenses.name')}</th>
              <th scope="col">{t('legal.licenses.version')}</th>
              <th scope="col">{t('legal.licenses.license')}</th>
            </tr>
          </thead>
          <tbody>
            {licenses.packages.map((item) => (
              <tr key={item.name}>
                <th scope="row">{item.name}</th>
                <td>{item.version}</td>
                <td>{item.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>{t('legal.licenses.bundled')}</h3>
        <p>{t('legal.licenses.bundledHint')}</p>
        <table className="license-table">
          <thead>
            <tr>
              <th scope="col">{t('legal.licenses.name')}</th>
              <th scope="col">{t('legal.licenses.license')}</th>
              <th scope="col">{t('legal.licenses.notice')}</th>
            </tr>
          </thead>
          <tbody>
            {licenses.bundled.map((item) => (
              <tr key={item.name}>
                <th scope="row">{item.name}</th>
                <td>{item.license}</td>
                <td>
                  {item.notices.map((notice) => (
                    <a key={notice} href={notice} target="_blank" rel="noreferrer">
                      {notice.split('/').pop()}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>{t('legal.licenses.texts')}</h3>
        <p>{t('legal.licenses.textsHint')}</p>
        <FullTexts />
        <p>
          <a href="/sbom.cdx.json" target="_blank" rel="noreferrer">
            {t('legal.licenses.sbom')}
          </a>
        </p>
      </section>
    </>
  );
}
