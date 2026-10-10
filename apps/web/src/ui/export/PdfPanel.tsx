import { useTranslation } from 'react-i18next';
import { useSession } from '../../state/session';
import { protectIncomplete } from '../../state/session-store';
import { CompressionField } from './CompressionField';
import { ProtectField } from './ProtectField';

export function PdfPanel() {
  const { t } = useTranslation();
  const count = useSession((state) => state.session.workspace.pages.length);
  const incomplete = useSession((state) => protectIncomplete(state.protect));
  const { startExport } = useSession.getState();
  return (
    <>
      <p>{t('export.pdf.summary', { count })}</p>
      <CompressionField />
      <ProtectField />
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={count === 0 || incomplete}
          onClick={() => void startExport()}
        >
          {t('export.pdf.run')}
        </button>
      </div>
    </>
  );
}
