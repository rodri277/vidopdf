import { expose, transfer } from 'comlink';
import { createBrowserCompressor } from '@vidopdf/pdf-adapters/compress';
import { createPdfLibWriter } from '@vidopdf/pdf-adapters/pdf-lib';
import { createZipBuilder } from '@vidopdf/pdf-adapters/zip';
import type { ExportWorkerApi } from './api';
import { createExportCore } from './export-core';
import { interFiles } from './fonts';

const core = createExportCore({
  writer: createPdfLibWriter({ fonts: interFiles }),
  compressor: createBrowserCompressor(),
  createZip: createZipBuilder,
});

const api: ExportWorkerApi = {
  register: core.register,
  release: core.release,
  readForm: core.readForm,
  releaseAsset: core.releaseAsset,
  registerAsset: core.registerAsset,
  cancelJob: core.cancelJob,
  splitBySize: core.splitBySize,

  async registerImage(sourceId, bytes, options) {
    const result = await core.registerImage(sourceId, bytes, options);
    return result.ok ? transfer(result, [result.value.pdf.buffer]) : result;
  },

  async runPlan(jobId, outputs, archiveName, onProgress) {
    const result = await core.runPlan(jobId, outputs, archiveName, onProgress);
    return result.ok ? transfer(result, [result.value.bytes.buffer]) : result;
  },
};

expose(api);
