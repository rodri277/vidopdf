import { expose, transfer } from 'comlink';
import { ok } from '@vidopdf/core';
import { createPdfLibWriter } from '@vidopdf/pdf-adapters/pdf-lib';
import type { ExportWorkerApi } from './api';

const writer = createPdfLibWriter();

const api: ExportWorkerApi = {
  inspect: (bytes) => writer.inspect(bytes),
  async assemble(sources, pages) {
    const result = await writer.assemble(new Map(sources), pages);
    return result.ok ? transfer(ok(result.value), [result.value.buffer]) : result;
  },
};

expose(api);
