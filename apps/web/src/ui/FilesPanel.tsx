import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../state/workspace-store';
import { formatBytes } from './format';

export function FilesPanel() {
  const { t } = useTranslation();
  const files = useWorkspace((state) => state.files);
  const rejections = useWorkspace((state) => state.rejections);

  return (
    <aside className="files" aria-labelledby="files-heading">
      <h2 id="files-heading">{t('files.heading')}</h2>
      {files.length === 0 && rejections.length === 0 ? (
        <p className="file-meta">{t('files.none')}</p>
      ) : (
        <ul>
          {files.map((file) => (
            <li key={file.id} className="file-item">
              <span className="file-dot" style={{ background: file.color }} aria-hidden="true" />
              <div>
                <div className="file-name" title={file.name}>
                  {file.name}
                </div>
                <div className="file-meta mono">
                  {t('files.pages', { count: file.pageCount })} · {formatBytes(file.size)}
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
    </aside>
  );
}
