import { useTranslation } from 'react-i18next';
import { useSession } from '../../state/session';

export function PdfPanel() {
  const { t } = useTranslation();
  const count = useSession((state) => state.session.workspace.pages.length);
  const { startExport } = useSession.getState();
  return (
    <>
      <p>{t('export.pdf.summary', { count })}</p>
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={count === 0}
          onClick={() => void startExport()}
        >
          {t('export.pdf.run')}
        </button>
      </div>
    </>
  );
}
