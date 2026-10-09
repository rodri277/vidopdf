import { expose, transfer } from 'comlink';
import {
  canEncodeImage,
  createBrowserRenderer,
  encodeBlankImage,
} from '@vidopdf/pdf-adapters/pdfjs';
import { createZipBuilder } from '@vidopdf/pdf-adapters/zip';
import type { RenderWorkerApi } from './api';
import { createRenderCore } from './render-core';

const core = createRenderCore({
  createRenderer: () =>
    createBrowserRenderer({ workerSrc: '/pdfjs/pdf.worker.min.mjs', assetBaseUrl: '/pdfjs/' }),
  createZip: createZipBuilder,
  encodeBlank: encodeBlankImage,
  canEncode: (format) => canEncodeImage(format),
});

const api: RenderWorkerApi = {
  open: core.open,
  cancel: core.cancel,
  release: core.release,
  outline: core.outline,
  encodableFormats: core.encodableFormats,
  cancelJob: core.cancelJob,

  async render(requestId, sourceId, pageIndex, targetWidth) {
    const rendered = await core.render(requestId, sourceId, pageIndex, targetWidth);
    return rendered.ok ? transfer(rendered, [rendered.value.image]) : rendered;
  },

  async exportImages(jobId, pages, options, baseName, onProgress) {
    const result = await core.exportImages(jobId, pages, options, baseName, onProgress);
    return result.ok ? transfer(result, [result.value.bytes.buffer]) : result;
  },
};

expose(api);
