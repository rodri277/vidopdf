import { useTranslation } from 'react-i18next';
import { useSession } from '../../state/session';
import type { JobState } from '../../state/session-store';
import { useUi } from '../../state/ui-store';
import type { ExportMode } from '../../state/ui-store';
import { formatBytes } from '../format';
import type { ProducedFile } from '../../workers/api';
import { Modal } from '../Modal';
import { ImagesPanel } from './ImagesPanel';
import { PdfPanel } from './PdfPanel';
import { SplitPanel } from './SplitPanel';
import { failureMessage } from './messages';

const MODES: readonly ExportMode[] = ['pdf', 'split', 'images'];

function Tabs() {
  const { t } = useTranslation();
  const mode = useUi((state) => state.exportMode);
  const setMode = useUi((state) => state.setExportMode);
  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">{t('export.tabsLabel')}</legend>
      {MODES.map((value) => (
        <label key={value} data-checked={mode === value}>
          <input
            type="radio"
            name="export-mode"
            value={value}
            checked={mode === value}
            onChange={() => {
              setMode(value);
            }}
          />
          <span>{t(`export.tabs.${value}`)}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Config() {
  const { t } = useTranslation();
  const mode = useUi((state) => state.exportMode);
  const { closeExport } = useUi.getState();
  const { clearSplit } = useSession.getState();
  return (
    <>
      <Tabs />
      <div className="export-body">
        {mode === 'pdf' && <PdfPanel />}
        {mode === 'split' && <SplitPanel />}
        {mode === 'images' && <ImagesPanel />}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            clearSplit();
            closeExport();
          }}
        >
          {t('export.close')}
        </button>
      </div>
    </>
  );
}

function summaryOf(
  job: Extract<JobState, { phase: 'ready' }>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const size = formatBytes(job.result.bytes.byteLength);
  if (job.job === 'images') return t('export.readyImages', { count: job.result.fileCount, size });
  return job.result.fileCount > 1
    ? t('export.readyMany', { files: job.result.fileCount, pages: job.result.pageCount, size })
    : t('export.ready', { pages: job.result.pageCount, size });
}

function Running({ job }: { job: Extract<JobState, { phase: 'running' }> }) {
  const { t } = useTranslation();
  const { cancelJob } = useSession.getState();
  const text = job.job === 'images' ? 'export.runningImages' : 'export.running';
  return (
    <>
      <progress max={job.total} value={job.done} aria-label={t('export.title')} />
      <p role="status" className="mono">
        {job.compressing === true
          ? t('export.runningCompressed', { percent: Math.round((job.done / job.total) * 100) })
          : t(text, { done: job.done, total: job.total })}
      </p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={cancelJob}>
          {t('export.cancel')}
        </button>
      </div>
    </>
  );
}

function Compressed({ result }: { result: ProducedFile }) {
  const { t } = useTranslation();
  const summary = result.compression;
  if (summary === undefined) return null;
  const saved = 1 - summary.bytesAfter / summary.bytesBefore;
  if (summary.picturesRecompressed === 0 || saved <= 0)
    return <p className="muted">{t('export.compressedNothing')}</p>;
  return (
    <p>
      {t('export.compressed', {
        before: formatBytes(summary.bytesBefore),
        after: formatBytes(summary.bytesAfter),
        percent: Math.round(saved * 100),
      })}
    </p>
  );
}

function Ready({ job }: { job: Extract<JobState, { phase: 'ready' }> }) {
  const { t } = useTranslation();
  const { dismissJob, saveResult } = useSession.getState();
  return (
    <>
      <p role="status">{summaryOf(job, t)}</p>
      <Compressed result={job.result} />
      <p className="mono result-name">{job.result.name}</p>
      {job.result.cappedPages > 0 && (
        <p className="muted">{t('export.capped', { count: job.result.cappedPages })}</p>
      )}
      <p className="muted">{t('export.readyHint')}</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={dismissJob}>
          {t('export.back')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the one action this view exists for
          autoFocus
          onClick={() => void saveResult()}
        >
          {t('export.save')}
        </button>
      </div>
    </>
  );
}

function Failed({ job }: { job: Extract<JobState, { phase: 'failed' }> }) {
  const { t } = useTranslation();
  const { dismissJob } = useSession.getState();
  const { text, detail } = failureMessage(t, job.failure, job.job);
  return (
    <>
      <p role="alert">{text}</p>
      {detail !== undefined && <p className="muted mono">{t('export.failedDetail', { detail })}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={dismissJob}>
          {t('export.back')}
        </button>
      </div>
    </>
  );
}

/**
 * Everything about getting files out: choose what to produce (one PDF, a split, pictures), see
 * what will come out, then watch it being built and save it. A running job keeps the dialog open
 * by itself, so "Extract" and "Split here" can start work and show it here.
 */
export function ExportDialog() {
  const { t } = useTranslation();
  const job = useSession((state) => state.job);
  const open = useUi((state) => state.exportOpen) || job.phase !== 'idle';
  const { closeExport } = useUi.getState();
  const { cancelJob, clearSplit, dismissJob } = useSession.getState();

  const close = () => {
    if (job.phase === 'running') cancelJob();
    else if (job.phase !== 'idle') dismissJob();
    else {
      clearSplit();
      closeExport();
    }
  };

  return (
    <Modal open={open} labelledBy="export-title" onClose={close} className="export-dialog">
      <h2 id="export-title">{t('export.title')}</h2>
      {job.phase === 'idle' && <Config />}
      {job.phase === 'running' && <Running job={job} />}
      {job.phase === 'ready' && <Ready job={job} />}
      {job.phase === 'failed' && <Failed job={job} />}
    </Modal>
  );
}
