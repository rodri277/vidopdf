import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as legacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfjsAssets, PdfjsLib } from '../pdfjs-renderer';

const pdfjsDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

/** The Node build of pdf.js, shaped like the module the browser worker passes in. */
export const nodePdfjs = legacy as unknown as PdfjsLib;

export const nodeAssets: PdfjsAssets = {
  workerSrc: pathToFileURL(join(pdfjsDir, 'legacy/build/pdf.worker.mjs')).href,
  // In Node the data files are read from disk, so this is a directory path, not a URL.
  assetBaseUrl: `${pdfjsDir}/`,
};

/** Node cannot fetch from the worker; pdf.js reads the files itself. */
export const nodeDocumentOptions = { useWorkerFetch: false, isOffscreenCanvasSupported: false };
