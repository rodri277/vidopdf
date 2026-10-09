import { transfer, expose } from 'comlink';
import { err, ok } from '@vidopdf/core';
import { createPdfjsRenderer } from '@vidopdf/pdf-adapters/pdfjs';
import type { RenderWorkerApi } from './api';

const renderer = createPdfjsRenderer({
  workerSrc: '/pdfjs/pdf.worker.min.mjs',
  assetBaseUrl: '/pdfjs/',
});

const api: RenderWorkerApi = {
  async renderFirstPage(bytes, targetWidth) {
    const opened = await renderer.open(bytes);
    if (!opened.ok) return err(opened.error);
    const rendered = await renderer.renderPage(0, targetWidth);
    await renderer.close();
    if (!rendered.ok) return err(rendered.error);
    return transfer(ok(rendered.value), [rendered.value.image]);
  },
};

expose(api);
