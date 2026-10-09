import { browserFileIO } from '../adapters/file-io';
import { exportWorker, renderWorker } from '../workers/clients';
import { createSessionStore } from './session-store';

/** The session the app uses, wired to the real workers and to the browser's file saving. */
export const useSession = createSessionStore({
  exportWorker,
  renderWorker,
  save: (bytes, name, mimeType) => browserFileIO.save(bytes, name, mimeType),
  newId: () => crypto.randomUUID(),
});
