import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoadedFile } from '../state/workspace-store';

export function Thumbnail({ file }: { file: LoadedFile }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const { thumbnail } = file;

  useEffect(() => {
    const element = canvas.current;
    if (element === null || thumbnail === undefined) return;
    element.width = thumbnail.width;
    element.height = thumbnail.height;
    element.getContext('2d')?.drawImage(thumbnail.image, 0, 0);
  }, [thumbnail]);

  return (
    <li className="thumb" style={{ borderTopColor: file.color, borderTopWidth: 3 }}>
      {thumbnail === undefined ? (
        <div
          className="thumb-skeleton"
          role="img"
          aria-label={t('thumb.loading', { name: file.name })}
        />
      ) : (
        <div role="img" aria-label={t('thumb.alt', { name: file.name })}>
          <canvas ref={canvas} aria-hidden="true" />
        </div>
      )}
      <span className="file-name" title={file.name}>
        {file.name}
      </span>
    </li>
  );
}
