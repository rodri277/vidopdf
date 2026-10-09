// Helpers shared with the benchmarks: they render and compare PDFs in Node.
export { nodeCodec } from './node-codec';
export { differingPixels, renderPage } from './render';
export type { Raster } from './render';
export { nodeAssets, nodeDocumentOptions, nodePdfjs } from './pdfjs-node';
