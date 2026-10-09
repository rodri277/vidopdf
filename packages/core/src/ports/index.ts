import type { PdfError } from '../errors';
import type { Result } from '../result';
import type { PageSelection } from '../workspace/page-ref';

export interface PdfInfo {
  readonly pageCount: number;
}

export interface RenderedPage<Image> {
  readonly width: number;
  readonly height: number;
  readonly image: Image;
}

/** Draws pages for thumbnails and previews. `Image` is whatever the platform paints (an ImageBitmap). */
export interface PdfRenderer<Image> {
  open(bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  renderPage(
    pageIndex: number,
    targetWidth: number,
    signal?: AbortSignal,
  ): Promise<Result<RenderedPage<Image>, PdfError>>;
  close(): Promise<void>;
}

/** Builds the output PDF from page references. The source PDFs are never modified. */
export interface PdfWriter {
  inspect(bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  assemble(
    sources: ReadonlyMap<string, Uint8Array>,
    pages: readonly PageSelection[],
    signal?: AbortSignal,
  ): Promise<Result<Uint8Array, PdfError>>;
}

export type CompressionPreset = 'screen' | 'balanced' | 'print';

/** Phase 3. Must never return a file larger than its input. */
export interface Compressor {
  compress(
    bytes: Uint8Array,
    preset: CompressionPreset,
    signal?: AbortSignal,
  ): Promise<Result<Uint8Array, PdfError>>;
}

/** Browser file access: the File System Access API when available, plain downloads otherwise. */
export interface FileIO {
  save(bytes: Uint8Array, suggestedName: string, mimeType: string): Promise<void>;
}
