import { expose, transfer } from 'comlink';
import { err, ok, pdfError } from '@vidopdf/core';
import type { PdfRenderer } from '@vidopdf/core';
import { createBrowserRenderer } from '@vidopdf/pdf-adapters/pdfjs';
import type { RenderWorkerApi } from './api';

const documents = new Map<string, PdfRenderer<ImageBitmap>>();
const running = new Map<number, AbortController>();

const api: RenderWorkerApi = {
  async open(sourceId, bytes) {
    const renderer = createBrowserRenderer({
      workerSrc: '/pdfjs/pdf.worker.min.mjs',
      assetBaseUrl: '/pdfjs/',
    });
    const opened = await renderer.open(bytes);
    if (opened.ok) documents.set(sourceId, renderer);
    else await renderer.close();
    return opened;
  },

  async render(requestId, sourceId, pageIndex, targetWidth) {
    const renderer = documents.get(sourceId);
    if (renderer === undefined) return err(pdfError('internal', `unknown source ${sourceId}`));
    const controller = new AbortController();
    running.set(requestId, controller);
    try {
      const rendered = await renderer.renderPage(pageIndex, targetWidth, controller.signal);
      return rendered.ok ? transfer(ok(rendered.value), [rendered.value.image]) : rendered;
    } finally {
      running.delete(requestId);
    }
  },

  cancel(requestId) {
    running.get(requestId)?.abort();
  },

  async release(sourceId) {
    await documents.get(sourceId)?.close();
    documents.delete(sourceId);
  },
};

expose(api);
