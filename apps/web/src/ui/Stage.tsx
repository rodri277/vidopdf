import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../state/workspace-store';
import { Thumbnail } from './Thumbnail';

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/** Drag-and-drop is wired on the element directly: it is a pointer-only convenience. */
function useFileDrop(target: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    };
    const leave = () => {
      setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      onFiles([...(event.dataTransfer?.files ?? [])]);
    };
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return () => {
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }, [target, onFiles]);

  return dragging;
}

interface StageProps {
  onAddFiles: () => void;
  onFiles: (files: File[]) => void;
}

export function Stage({ onAddFiles, onFiles }: StageProps) {
  const { t } = useTranslation();
  const files = useWorkspace((state) => state.files);
  const stage = useRef<HTMLElement>(null);
  const dragging = useFileDrop(stage, onFiles);

  return (
    <main className="stage" ref={stage} data-dragging={dragging}>
      {files.length === 0 ? (
        <div className="empty">
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.hint')}</p>
          <p className="privacy">{t('app.privacy')}</p>
          <button type="button" className="btn btn-primary" onClick={onAddFiles}>
            {t('empty.choose')}
          </button>
        </div>
      ) : (
        <ul className="grid">
          {files.map((file) => (
            <Thumbnail key={file.id} file={file} />
          ))}
        </ul>
      )}
    </main>
  );
}
