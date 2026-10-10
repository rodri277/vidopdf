import { useTranslation } from 'react-i18next';
import { useSession } from '../state/session';
import { protectIncomplete } from '../state/session-store';
import { splitHereDraft } from '../state/split';
import { useUi } from '../state/ui-store';
import { deleteSelection, duplicateSelection, insertBlankPage, rotateSelection } from './actions';

export function ContextPanel() {
  const { t } = useTranslation();
  const workspace = useSession((state) => state.session.workspace);
  const count = workspace.selection.length;
  const exporting = useSession((state) => state.job.phase !== 'idle');
  const { extractSelection } = useSession.getState();
  const incomplete = useSession((state) => protectIncomplete(state.protect));
  const { openExport, openCrop, openSign } = useUi.getState();
  // "Split here" cuts after the last selected page; with that page last there is nothing to cut.
  const lastSelected =
    workspace.pages.findLastIndex((page) => workspace.selection.includes(page.id)) + 1;
  const canCrop = workspace.pages.some(
    (page) => page.kind === 'original' && workspace.selection.includes(page.id),
  );
  const canSplitHere = lastSelected > 0 && lastSelected < workspace.pages.length;

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
            <button type="button" className="btn" disabled={!canCrop} onClick={openCrop}>
              {t('panel.crop')}
            </button>
            <button type="button" className="btn" disabled={!canCrop} onClick={openSign}>
              {t('panel.sign')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={incomplete}
              onClick={() => void extractSelection()}
            >
              {t('panel.extract')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!canSplitHere}
              onClick={() => {
                openExport('split', splitHereDraft(lastSelected, workspace.pages.length));
              }}
            >
              {t('panel.splitHere')}
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
                onClick={() => {
                  openExport('pdf');
                }}
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
