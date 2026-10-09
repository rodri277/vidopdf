import { useTranslation } from 'react-i18next';
import { useSession } from '../state/session-store';
import { Modal } from './Modal';
import { formatBytes } from './format';

/** Progress while the PDF is built, then its size, before anything is written to disk. */
export function ExportDialog() {
  const { t } = useTranslation();
  const state = useSession((s) => s.exportState);
  const { cancelExport, dismissExport, saveExport } = useSession.getState();
  const open = state.phase !== 'idle';
  const close = state.phase === 'running' ? cancelExport : dismissExport;

  return (
    <Modal open={open} labelledBy="export-title" onClose={close} className="export-dialog">
      <h2 id="export-title">{t('export.title')}</h2>
      {state.phase === 'running' && (
        <>
          <progress max={state.total} value={state.done} aria-label={t('export.title')} />
          <p role="status" className="mono">
            {t('export.running', { done: state.done, total: state.total })}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={cancelExport}>
              {t('export.cancel')}
            </button>
          </div>
        </>
      )}
      {state.phase === 'ready' && (
        <>
          <p role="status">
            {t('export.ready', {
              pages: state.pageCount,
              size: formatBytes(state.bytes.byteLength),
            })}
          </p>
          <p className="muted">{t('export.readyHint')}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={dismissExport}>
              {t('export.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the one action this dialog exists for
              autoFocus
              onClick={() => void saveExport()}
            >
              {t('export.save')}
            </button>
          </div>
        </>
      )}
      {state.phase === 'failed' && (
        <>
          <p role="alert">{t('export.failed')}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={dismissExport}>
              {t('export.close')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
