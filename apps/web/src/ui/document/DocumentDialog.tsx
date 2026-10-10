import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../state/session';
import { useUi } from '../../state/ui-store';
import type { DocumentTab } from '../../state/ui-store';
import { Modal } from '../Modal';
import { MetadataPanel } from './MetadataPanel';
import { NumberingPanel } from './NumberingPanel';
import { StampPreview } from './StampPreview';
import { WatermarkPanel } from './WatermarkPanel';

const TABS: readonly DocumentTab[] = ['numbering', 'watermark', 'metadata'];

/**
 * What is stamped on the pages and written into the output file, with a live preview. Everything
 * here is part of the workspace: it can be undone, and it is applied when exporting.
 */
export function DocumentDialog() {
  const { t } = useTranslation();
  const open = useUi((state) => state.documentOpen);
  const tab = useUi((state) => state.documentTab);
  const { closeDocument, setDocumentTab } = useUi.getState();
  const total = useSession((state) => state.session.workspace.pages.length);
  const { undo, redo } = useSession.getState();
  const [preview, setPreview] = useState(0);
  return (
    <Modal
      open={open}
      labelledBy="document-title"
      onClose={closeDocument}
      className="document-dialog"
    >
      <h2 id="document-title">{t('document.title')}</h2>
      <p className="muted">{t('document.hint')}</p>
      <div className="document-layout">
        <div className="document-controls">
          <fieldset className="segmented">
            <legend className="visually-hidden">{t('document.tabsLabel')}</legend>
            {TABS.map((value) => (
              <label key={value} data-checked={tab === value}>
                <input
                  type="radio"
                  name="document-tab"
                  value={value}
                  checked={tab === value}
                  onChange={() => {
                    setDocumentTab(value);
                  }}
                />
                <span>{t(`document.tabs.${value}`)}</span>
              </label>
            ))}
          </fieldset>
          <div className="document-panel">
            {tab === 'numbering' && <NumberingPanel />}
            {tab === 'watermark' && <WatermarkPanel />}
            {tab === 'metadata' && <MetadataPanel />}
          </div>
        </div>
        {tab !== 'metadata' && (
          <div className="document-preview">
            <StampPreview index={Math.min(preview, Math.max(0, total - 1))} />
            <label className="field">
              <span>{t('document.previewPage')}</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, total)}
                value={Math.min(preview, Math.max(0, total - 1)) + 1}
                onChange={(event) => {
                  const next = event.target.valueAsNumber;
                  if (Number.isFinite(next)) setPreview(Math.max(0, Math.min(total - 1, next - 1)));
                }}
              />
            </label>
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            undo();
          }}
        >
          {t('topbar.undo')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            redo();
          }}
        >
          {t('topbar.redo')}
        </button>
        <button type="button" className="btn btn-primary" onClick={closeDocument}>
          {t('document.close')}
        </button>
      </div>
    </Modal>
  );
}
