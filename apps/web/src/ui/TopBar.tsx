import { useTranslation } from 'react-i18next';
import { languages, setLanguage } from '../i18n';
import type { Language } from '../i18n';
import { useWorkspace } from '../state/workspace-store';

const LANGUAGE_NAMES: Record<Language, string> = { es: 'Español', en: 'English' };

interface TopBarProps {
  onAddFiles: () => void;
}

export function TopBar({ onAddFiles }: TopBarProps) {
  const { t, i18n } = useTranslation();
  const hasFiles = useWorkspace((state) => state.files.length > 0);
  const exporting = useWorkspace((state) => state.status.kind === 'exporting');
  const exportAll = useWorkspace((state) => state.exportAll);

  return (
    <header className="topbar">
      <h1>{t('app.name')}</h1>
      <button type="button" className="btn" onClick={onAddFiles}>
        {t('topbar.addFiles')}
      </button>
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
        disabled={!hasFiles || exporting}
        onClick={() => void exportAll()}
      >
        {t('topbar.export')}
      </button>
    </header>
  );
}
