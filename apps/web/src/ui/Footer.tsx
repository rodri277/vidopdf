import { useTranslation } from 'react-i18next';
import { useSession } from '../state/session-store';
import { formatBytes } from './format';

export function Footer() {
  const { t } = useTranslation();
  const exportState = useSession((state) => state.exportState);
  const { cancelExport, saveExport, dismissExport } = useSession.getState();

  return (
    <footer className="footer">
      <span>{t('app.privacy')}</span>
      <span role="status" className="mono export-status">
        {exportState.phase === 'running' &&
          t('status.exporting', { done: exportState.done, total: exportState.total })}
        {exportState.phase === 'ready' &&
          t('status.ready', {
            pages: exportState.pageCount,
            size: formatBytes(exportState.bytes.byteLength),
          })}
        {exportState.phase === 'failed' && t('status.failed')}
      </span>
      {exportState.phase === 'running' && (
        <button type="button" className="btn btn-small" onClick={cancelExport}>
          {t('status.cancel')}
        </button>
      )}
      {exportState.phase === 'ready' && (
        <>
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => void saveExport()}
          >
            {t('status.save')}
          </button>
          <button type="button" className="btn btn-small" onClick={dismissExport}>
            {t('status.cancel')}
          </button>
        </>
      )}
      <span style={{ marginLeft: 'auto' }}>
        <a href="/THIRD_PARTY_LICENSES.txt" target="_blank" rel="noreferrer">
          {t('footer.licenses')}
        </a>
      </span>
    </footer>
  );
}
