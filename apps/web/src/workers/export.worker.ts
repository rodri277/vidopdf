import { expose, transfer } from 'comlink';
import { err, ok, pdfError } from '@vidopdf/core';
import { createPdfLibWriter } from '@vidopdf/pdf-adapters/pdf-lib';
import type { ExportWorkerApi } from './api';

const writer = createPdfLibWriter();
const sources = new Map<string, Uint8Array>();
const running = new Map<number, AbortController>();

const api: ExportWorkerApi = {
  async register(sourceId, bytes) {
    const info = await writer.inspect(bytes);
    if (info.ok) sources.set(sourceId, bytes);
    return info;
  },

  release(sourceId) {
    sources.delete(sourceId);
  },

  async assemble(exportId, pages, onProgress) {
    const controller = new AbortController();
    running.set(exportId, controller);
    try {
      const result = await writer.assemble(sources, pages, {
        signal: controller.signal,
        onProgress,
      });
      return result.ok ? transfer(ok(result.value), [result.value.buffer]) : result;
    } catch (error) {
      return err(pdfError('internal', error instanceof Error ? error.message : String(error)));
    } finally {
      running.delete(exportId);
    }
  },

  cancel(exportId) {
    running.get(exportId)?.abort();
  },
};

expose(api);
