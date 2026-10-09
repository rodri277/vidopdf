import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../state/workspace-store';
import { formatBytes } from './format';

export function Footer() {
  const { t } = useTranslation();
  const status = useWorkspace((state) => state.status);

  return (
    <footer className="footer">
      <span>{t('app.privacy')}</span>
      <span role="status" className="mono">
        {status.kind === 'exporting' && t('status.exporting')}
        {status.kind === 'exported' && t('status.exported', { size: formatBytes(status.bytes) })}
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <a href="/THIRD_PARTY_LICENSES.txt" target="_blank" rel="noreferrer">
          {t('footer.licenses')}
        </a>
      </span>
    </footer>
  );
}
