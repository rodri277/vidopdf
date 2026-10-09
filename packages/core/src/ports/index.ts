import type { PdfError } from '../errors';
import type { Result } from '../result';
import type { CompressionReport } from '../compression/report';
import type { Decorations } from '../export/decorations';
import type { ImageExportOptions } from '../images/export';
import type { ImagePageOptions } from '../images/layout';
import type { ExportPage, Rotation } from '../workspace/page-ref';

export interface PdfInfo {
  readonly pageCount: number;
}

export interface RenderedPage<Image> {
  readonly width: number;
  readonly height: number;
  readonly image: Image;
}

/** One bookmark of a PDF, resolved to the page it points at. */
export interface OutlineEntry {
  readonly title: string;
  /** Zero-based index of the target page in its file. */
  readonly pageIndex: number;
  /** 1 for top-level bookmarks. */
  readonly level: number;
}

/** A page drawn and encoded as an image file. */
export interface EncodedImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** The resolution really used, lower than asked when the page was too large for the canvas budget. */
  readonly dpi: number;
  readonly capped: boolean;
}

/** Draws pages for thumbnails and previews. `Image` is whatever the platform paints (an ImageBitmap). */
export interface PdfRenderer<Image> {
  /** With `takeOwnership` the caller gives the bytes away, which saves a copy of the whole file. */
  open(
    bytes: Uint8Array,
    options?: { readonly takeOwnership?: boolean },
  ): Promise<Result<PdfInfo, PdfError>>;
  renderPage(
    pageIndex: number,
    targetWidth: number,
    signal?: AbortSignal,
  ): Promise<Result<RenderedPage<Image>, PdfError>>;
  /** The bookmarks of the open document, flattened with their level. Entries that point nowhere are left out. */
  outline(): Promise<Result<OutlineEntry[], PdfError>>;
  /**
   * Draws a page at a print resolution and encodes it (PNG, JPEG or WebP). `rotation` is the
   * quarter turn the user added on top of the page's own, so exported images match the grid.
   */
  renderImage(
    pageIndex: number,
    options: ImageExportOptions,
    signal?: AbortSignal,
    rotation?: Rotation,
  ): Promise<Result<EncodedImage, PdfError>>;
  /**
   * Lets go of what drawing pages leaves behind (decoded pictures, page objects). Call it every
   * few dozen pages when drawing many in a row, or memory grows with the size of the document.
   */
  trim(): Promise<void>;
  close(): Promise<void>;
}

export interface WriteOptions {
  readonly signal?: AbortSignal;
  /** Stamps, metadata, bookmarks and form values to apply while assembling. */
  readonly decorations?: Decorations;
  /** Pictures that stamps and signatures use, by asset id. */
  readonly assets?: ReadonlyMap<string, Uint8Array>;
  /** Called after each page is added, with the number done so far and the total. */
  readonly onProgress?: (done: number, total: number) => void;
}

/** Builds the output PDF from page references. The source PDFs are never modified. */
export interface PdfWriter {
  inspect(bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  /** A one-page PDF holding a JPEG or PNG, laid out as the options say and turned upright by its EXIF data. */
  fromImage(bytes: Uint8Array, options: ImagePageOptions): Promise<Result<Uint8Array, PdfError>>;
  assemble(
    sources: ReadonlyMap<string, Uint8Array>,
    pages: readonly ExportPage[],
    options?: WriteOptions,
  ): Promise<Result<Uint8Array, PdfError>>;
}

export interface ZipOptions {
  /** Deflate the entry. PDFs gain from it; PNG, JPEG and WebP are already compressed, so store them. */
  readonly deflate?: boolean;
}

/** Builds a ZIP file entry by entry, so each page can be added as soon as it is ready. */
export interface ZipBuilder {
  add(name: string, bytes: Uint8Array, options?: ZipOptions): Result<void, PdfError>;
  finish(): Result<Uint8Array, PdfError>;
}

export type CompressionPreset = 'screen' | 'balanced' | 'print';

export interface CompressionOptions {
  readonly signal?: AbortSignal;
  /** Pictures dealt with so far, and the total. */
  readonly onProgress?: (done: number, total: number) => void;
}

export interface CompressionOutcome {
  readonly bytes: Uint8Array;
  readonly report: CompressionReport;
}

/** Shrinks the pictures of a PDF. Never returns a file larger than its input. */
export interface Compressor {
  compress(
    bytes: Uint8Array,
    preset: CompressionPreset,
    options?: CompressionOptions,
  ): Promise<Result<CompressionOutcome, PdfError>>;
}

/** Browser file access: the File System Access API when available, plain downloads otherwise. */
export interface FileIO {
  save(bytes: Uint8Array, suggestedName: string, mimeType: string): Promise<void>;
}
