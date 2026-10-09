import { useTranslation } from 'react-i18next';
import { useSession } from '../state/session';
import { deleteSelection, duplicateSelection, insertBlankPage, rotateSelection } from './actions';

export function ContextPanel() {
  const { t } = useTranslation();
  const workspace = useSession((state) => state.session.workspace);
  const count = workspace.selection.length;
  const exporting = useSession((state) => state.job.phase !== 'idle');
  const { startExport } = useSession.getState();

  return (
    <aside className="context" aria-labelledby="context-heading">
      {count > 0 ? (
        <>
          <h2 id="context-heading">{t('panel.selection', { count })}</h2>
          <div className="actions" role="group" aria-label={t('panel.actions')}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                rotateSelection(90);
              }}
            >
              {t('panel.rotateRight')} <kbd>R</kbd>
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                rotateSelection(-90);
              }}
            >
              {t('panel.rotateLeft')} <kbd>⇧R</kbd>
            </button>
            <button type="button" className="btn" onClick={duplicateSelection}>
              {t('panel.duplicate')} <kbd>⌘D</kbd>
            </button>
            <button type="button" className="btn btn-danger" onClick={deleteSelection}>
              {t('panel.delete')} <kbd>⌫</kbd>
            </button>
            <button type="button" className="btn" onClick={insertBlankPage}>
              {t('panel.insertBlank')}
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="context-heading">{t('panel.exportHeading')}</h2>
          {workspace.pages.length === 0 ? (
            <p className="muted">{t('panel.exportEmpty')}</p>
          ) : (
            <>
              <p>{t('panel.exportSummary', { count: workspace.pages.length })}</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={exporting}
                onClick={() => void startExport()}
              >
                {t('topbar.export')}
              </button>
              <h3>{t('panel.none')}</h3>
              <p className="muted">{t('panel.noneHint')}</p>
              <button type="button" className="btn" onClick={insertBlankPage}>
                {t('panel.insertBlank')}
              </button>
            </>
          )}
        </>
      )}
    </aside>
  );
}
