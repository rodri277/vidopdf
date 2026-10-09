export { err, mapResult, ok } from './result';
export type { Result } from './result';
export { pdfError } from './errors';
export type { PdfError, PdfErrorKind } from './errors';
export { rotate } from './workspace/page-ref';
export type { PageSelection, Rotation } from './workspace/page-ref';
export type {
  CompressionPreset,
  Compressor,
  FileIO,
  PdfInfo,
  PdfRenderer,
  PdfWriter,
  RenderedPage,
} from './ports';
