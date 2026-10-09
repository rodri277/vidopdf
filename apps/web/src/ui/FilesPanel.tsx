import { useTranslation } from 'react-i18next';
import { formatBytes } from './format';
import { sourceColor } from './source-colors';
import { MEMORY_WARNING_BYTES } from '@vidopdf/core';
import { useSession } from '../state/session';
import { totalLoadedBytes } from '../state/session-store';

export function FilesPanel() {
  const { t } = useTranslation();
  const workspace = useSession((state) => state.session.workspace);
  const rejections = useSession((state) => state.rejections);
  const loading = useSession((state) => state.loading);
  const total = totalLoadedBytes(workspace);
  const inUse = (sourceId: string) =>
    workspace.pages.filter((page) => page.kind === 'original' && page.sourceId === sourceId).length;

  return (
    <aside className="files" aria-labelledby="files-heading">
      <h2 id="files-heading">{t('files.heading')}</h2>
      {workspace.sources.length === 0 && rejections.length === 0 && loading === 0 ? (
        <p className="file-meta">{t('files.none')}</p>
      ) : (
        <ul>
          {workspace.sources.map((source, index) => (
            <li key={source.id} className="file-item">
              <span
                className="file-dot"
                style={{ background: sourceColor(index) }}
                aria-hidden="true"
              />
              <div>
                <div className="file-name" title={source.name}>
                  {source.name}
                </div>
                <div className="file-meta mono">
                  {t('files.pages', { count: inUse(source.id) })} · {formatBytes(source.size)}
                </div>
              </div>
            </li>
          ))}
          {rejections.map((rejection) => (
            <li key={rejection.id} className="file-item file-error">
              <span
                className="file-dot"
                style={{ background: 'var(--danger)' }}
                aria-hidden="true"
              />
              <div>{t(`errors.${rejection.kind}`, { name: rejection.name })}</div>
            </li>
          ))}
        </ul>
      )}
      {loading > 0 && (
        <p className="file-meta" role="status">
          {t('files.loading', { count: loading })}
        </p>
      )}
      {total > MEMORY_WARNING_BYTES && (
        <p className="file-warning" role="status">
          {t('memory.warning', { size: formatBytes(total) })}
        </p>
      )}
    </aside>
  );
}
