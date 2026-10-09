import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import type { ExportWorkerApi, RenderWorkerApi } from './api';

let renderClient: Remote<RenderWorkerApi> | undefined;
let exportClient: Remote<ExportWorkerApi> | undefined;

/** Workers start on first use so the initial load stays small. */
export function renderWorker(): Remote<RenderWorkerApi> {
  renderClient ??= wrap<RenderWorkerApi>(
    new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' }),
  );
  return renderClient;
}

export function exportWorker(): Remote<ExportWorkerApi> {
  exportClient ??= wrap<ExportWorkerApi>(
    new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }),
  );
  return exportClient;
}
