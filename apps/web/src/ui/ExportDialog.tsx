import { useTranslation } from 'react-i18next';
import { useSession } from '../state/session';
import { Modal } from './Modal';
import { formatBytes } from './format';

/** Progress while the files are built, then what came out and its size, before anything is written to disk. */
export function ExportDialog() {
  const { t } = useTranslation();
  const job = useSession((s) => s.job);
  const { cancelJob, dismissJob, saveResult } = useSession.getState();
  const open = job.phase !== 'idle';
  const close = job.phase === 'running' ? cancelJob : dismissJob;

  return (
    <Modal open={open} labelledBy="export-title" onClose={close} className="export-dialog">
      <h2 id="export-title">{t('export.title')}</h2>
      {job.phase === 'running' && (
        <>
          <progress max={job.total} value={job.done} aria-label={t('export.title')} />
          <p role="status" className="mono">
            {t('export.running', { done: job.done, total: job.total })}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={cancelJob}>
              {t('export.cancel')}
            </button>
          </div>
        </>
      )}
      {job.phase === 'ready' && (
        <>
          <p role="status">
            {job.result.fileCount > 1
              ? t('export.readyMany', {
                  files: job.result.fileCount,
                  pages: job.result.pageCount,
                  size: formatBytes(job.result.bytes.byteLength),
                })
              : t('export.ready', {
                  pages: job.result.pageCount,
                  size: formatBytes(job.result.bytes.byteLength),
                })}
          </p>
          <p className="mono">{job.result.name}</p>
          {job.result.cappedPages > 0 && (
            <p className="muted">{t('export.capped', { count: job.result.cappedPages })}</p>
          )}
          <p className="muted">{t('export.readyHint')}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={dismissJob}>
              {t('export.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the one action this dialog exists for
              autoFocus
              onClick={() => void saveResult()}
            >
              {t('export.save')}
            </button>
          </div>
        </>
      )}
      {job.phase === 'failed' && (
        <>
          <p role="alert">{t('export.failed')}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={dismissJob}>
              {t('export.close')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
