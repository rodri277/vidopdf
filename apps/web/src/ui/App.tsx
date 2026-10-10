import { Suspense, lazy, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useSession } from '../state/session';
import { navigate, useLegalPage } from '../legal/route';
import { ContextPanel } from './ContextPanel';
import { FilesPanel } from './FilesPanel';
import { Footer } from './Footer';
import { Stage } from './Stage';
import { useUi } from '../state/ui-store';
import { useShortcuts } from './useShortcuts';
import { useWindowGuards } from './useWindowGuards';
import { TopBar } from './TopBar';
import './app.css';

// The preview is only needed once a page is opened, so it stays out of the first download.
const ExportDialog = lazy(() =>
  import('./export/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);
const ImageImportDialog = lazy(() =>
  import('./ImageImportDialog').then((m) => ({ default: m.ImageImportDialog })),
);
const LegalPage = lazy(() => import('../legal/LegalPage').then((m) => ({ default: m.LegalPage })));
const DocumentDialog = lazy(() =>
  import('./document/DocumentDialog').then((m) => ({ default: m.DocumentDialog })),
);
const CropDialog = lazy(() => import('./crop/CropDialog').then((m) => ({ default: m.CropDialog })));
const PreviewDialog = lazy(() =>
  import('./PreviewDialog').then((m) => ({ default: m.PreviewDialog })),
);

export function App() {
  const input = useRef<HTMLInputElement>(null);
  const addFiles = useSession((state) => state.addFiles);

  const openPicker = useCallback(() => {
    input.current?.click();
  }, []);
  useShortcuts(openPicker);
  const announcement = useUi((state) => state.announcement);
  const previewOpen = useUi((state) => state.previewId !== null);
  const exportRequested = useUi((state) => state.exportOpen);
  const jobActive = useSession((state) => state.job.phase !== 'idle');
  const exportOpen = exportRequested || jobActive;
  const documentOpen = useUi((state) => state.documentOpen);
  const cropOpen = useUi((state) => state.cropOpen);
  const importOpen = useSession((state) => state.pendingImages.length > 0);
  const legalPage = useLegalPage();
  const onFiles = useCallback(
    (files: File[]) => {
      navigate(); // files added from a legal page are shown in the workspace
      void addFiles(files);
    },
    [addFiles],
  );
  useWindowGuards(onFiles);
  const onPicked = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles([...(event.target.files ?? [])]);
    event.target.value = '';
  };

  return (
    <div className="shell">
      <TopBar onAddFiles={openPicker} />
      {legalPage === undefined ? (
        <div className="body">
          <FilesPanel />
          <Stage onAddFiles={openPicker} onFiles={onFiles} />
          <ContextPanel />
        </div>
      ) : (
        <Suspense fallback={<main className="legal" />}>
          <LegalPage page={legalPage} />
        </Suspense>
      )}
      <Footer />
      <Suspense fallback={null}>
        {exportOpen && <ExportDialog />}
        {importOpen && <ImageImportDialog />}
        {documentOpen && <DocumentDialog />}
        {cropOpen && <CropDialog />}
      </Suspense>
      {previewOpen && (
        <Suspense fallback={null}>
          <PreviewDialog />
        </Suspense>
      )}
      <div className="visually-hidden" role="status" aria-live="polite" data-testid="announcer">
        {announcement}
      </div>
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf,image/jpeg,image/png,.jpg,.jpeg,.png"
        multiple
        hidden
        data-testid="file-input"
        onChange={onPicked}
      />
    </div>
  );
}
