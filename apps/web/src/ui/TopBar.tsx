import { useTranslation } from 'react-i18next';
import { redoLabel, undoLabel } from '@vidopdf/core';
import type { CommandLabel } from '@vidopdf/core';
import { languages, setLanguage } from '../i18n';
import type { Language } from '../i18n';
import { useSession } from '../state/session';
import { redoAction, undoAction } from './actions';

const LANGUAGE_NAMES: Record<Language, string> = { es: 'Español', en: 'English' };

interface TopBarProps {
  onAddFiles: () => void;
}

export function TopBar({ onAddFiles }: TopBarProps) {
  const { t, i18n } = useTranslation();
  const session = useSession((state) => state.session);
  const hasPages = session.workspace.pages.length > 0;
  const exporting = useSession((state) => state.job.phase === 'running');
  const { startExport } = useSession.getState();

  const undoWhat = undoLabel(session);
  const redoWhat = redoLabel(session);
  const describe = (label: CommandLabel) =>
    `${t(`history.${label.kind}`)} (${String(label.count)})`;

  return (
    <header className="topbar">
      <h1>{t('app.name')}</h1>
      <button type="button" className="btn" onClick={onAddFiles}>
        {t('topbar.addFiles')}
      </button>
      <button
        type="button"
        className="btn"
        disabled={undoWhat === undefined}
        title={
          undoWhat === undefined
            ? t('topbar.nothingToUndo')
            : `${t('topbar.undo')}: ${describe(undoWhat)}`
        }
        onClick={undoAction}
      >
        {t('topbar.undo')}
      </button>
      <button
        type="button"
        className="btn"
        disabled={redoWhat === undefined}
        title={
          redoWhat === undefined
            ? t('topbar.nothingToRedo')
            : `${t('topbar.redo')}: ${describe(redoWhat)}`
        }
        onClick={redoAction}
      >
        {t('topbar.redo')}
      </button>
      <span className="spacer" />
      <div role="group" aria-label={t('topbar.language')} className="lang">
        {languages.map((language) => (
          <button
            key={language}
            type="button"
            lang={language}
            aria-label={LANGUAGE_NAMES[language]}
            aria-pressed={i18n.language === language}
            onClick={() => {
              setLanguage(language);
            }}
          >
            {language.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!hasPages || exporting}
        onClick={() => void startExport()}
      >
        {t('topbar.export')}
      </button>
    </header>
  );
}
