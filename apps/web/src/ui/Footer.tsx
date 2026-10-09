import { useTranslation } from 'react-i18next';
import { LegalLink } from '../legal/LegalLink';
import { LEGAL_PAGES, useLegalPage } from '../legal/route';

export function Footer() {
  const { t } = useTranslation();
  const current = useLegalPage();

  return (
    <footer className="footer">
      <span>{t('app.privacy')}</span>
      <nav aria-label={t('footer.nav')} className="footer-links">
        {LEGAL_PAGES.map((page) => (
          <LegalLink key={page} page={page} current={page === current}>
            {t(`footer.${page}`)}
          </LegalLink>
        ))}
      </nav>
    </footer>
  );
}
