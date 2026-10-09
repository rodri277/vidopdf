import { useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useSession } from '../state/session-store';
import { FilesPanel } from './FilesPanel';
import { Footer } from './Footer';
import { Stage } from './Stage';
import { useUi } from '../state/ui-store';
import { useShortcuts } from './useShortcuts';
import { TopBar } from './TopBar';
import './app.css';

export function App() {
  const input = useRef<HTMLInputElement>(null);
  const addFiles = useSession((state) => state.addFiles);

  const openPicker = useCallback(() => {
    input.current?.click();
  }, []);
  useShortcuts(openPicker);
  const announcement = useUi((state) => state.announcement);
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
      </div>
      <Footer />
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
