import { browserFileIO } from '../adapters/file-io';
import { exportWorker, renderWorker } from '../workers/clients';
import { createSessionStore } from './session-store';

let counter = 0;
/** randomUUID only exists on secure origins; a plain-HTTP preview on the local network still works. */
function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${String(Date.now())}-${String(++counter)}`;
}

/** The session the app uses, wired to the real workers and to the browser's file saving. */
export const useSession = createSessionStore({
  exportWorker,
  renderWorker,
  save: (bytes, name, mimeType) => browserFileIO.save(bytes, name, mimeType),
  newId,
});
