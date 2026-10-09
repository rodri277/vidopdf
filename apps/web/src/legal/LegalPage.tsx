import { Fragment, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { legalEn } from './en';
import { legalEs } from './es';
import { LegalLink } from './LegalLink';
import { Licenses } from './Licenses';
import { LEGAL_PAGES, navigate } from './route';
import type { LegalPage as Page } from './route';
import { CONTACT_EMAIL } from './types';
import type { LegalDocument } from './types';

/** Turns the contact address inside a text into a mail link. */
function WithMailLinks({ text }: { text: string }) {
  const parts = text.split(CONTACT_EMAIL);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function Document({ document }: { document: LegalDocument }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="muted">{t('legal.updated', { date: document.updated })}</p>
      {document.sections.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>
              <WithMailLinks text={paragraph} />
            </p>
          ))}
          {section.items !== undefined && (
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

/** Privacy, legal notice, terms and licenses, inside the app, in the language of the interface. */
export function LegalPage({ page }: { page: Page }) {
  const { t, i18n } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const texts = i18n.language === 'en' ? legalEn : legalEs;
  const title = page === 'licenses' ? t('legal.licenses.title') : texts[page].title;

  // Moving to a new page should be announced and should start reading from its title. Only a
  // change of page moves the focus; switching the language must leave it on the language button.
  useEffect(() => {
    heading.current?.focus();
  }, [page]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${t('app.name')}`;
    return () => {
      document.title = previous;
    };
  }, [title, t]);

  return (
    <main className="legal" id="legal-page">
      <nav aria-label={t('legal.navLabel')} className="legal-nav">
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigate();
          }}
        >
          {t('legal.back')}
        </button>
        <ul>
          {LEGAL_PAGES.map((name) => (
            <li key={name}>
              <LegalLink page={name} current={name === page}>
                {t(`footer.${name}`)}
              </LegalLink>
            </li>
          ))}
        </ul>
      </nav>
      <article>
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        {page === 'licenses' ? <Licenses /> : <Document document={texts[page]} />}
      </article>
    </main>
  );
}
