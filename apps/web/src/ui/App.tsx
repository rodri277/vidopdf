import { Suspense, lazy, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useSession } from '../state/session';
import { ContextPanel } from './ContextPanel';
import { ExportDialog } from './ExportDialog';
import { FilesPanel } from './FilesPanel';
import { Footer } from './Footer';
import { Stage } from './Stage';
import { useUi } from '../state/ui-store';
import { useShortcuts } from './useShortcuts';
import { TopBar } from './TopBar';
import './app.css';

// The preview is only needed once a page is opened, so it stays out of the first download.
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
  const onFiles = useCallback(
    (files: File[]) => {
      void addFiles(files);
    },
    [addFiles],
  );
  const onPicked = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles([...(event.target.files ?? [])]);
    event.target.value = '';
  };

  return (
    <div className="shell">
      <TopBar onAddFiles={openPicker} />
      <div className="body">
        <FilesPanel />
        <Stage onAddFiles={openPicker} onFiles={onFiles} />
        <ContextPanel />
      </div>
      <Footer />
      <ExportDialog />
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
        accept=".pdf,application/pdf"
        multiple
        hidden
        data-testid="file-input"
        onChange={onPicked}
      />
    </div>
  );
}
