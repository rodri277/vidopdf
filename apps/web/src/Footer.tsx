import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="footer">
      <span>{t('app.privacy')}</span>
      <span style={{ marginLeft: 'auto' }}>
        <a href="/THIRD_PARTY_LICENSES.txt" target="_blank" rel="noreferrer">
          {t('footer.licenses')}
        </a>
      </span>
    </footer>
  );
}
