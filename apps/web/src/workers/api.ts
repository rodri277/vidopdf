import type {
  EncodedImage,
  ExportPage,
  ImageExportOptions,
  ImagePageOptions,
  OutlineEntry,
  PageRef,
  PdfError,
  PdfInfo,
  RenderedPage,
  Result,
  Rotation,
  SplitError,
} from '@vidopdf/core';

/** One file the export worker is asked to produce. */
export interface PlannedOutput {
  readonly name: string;
  readonly pages: readonly ExportPage[];
}

/** A finished download: one file, or a ZIP of several. */
export interface ProducedFile {
  readonly kind: 'pdf' | 'zip' | 'image';
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
  /** Files inside (1 for a single PDF or image). */
  readonly fileCount: number;
  readonly pageCount: number;
  /** Pages whose resolution had to be lowered to fit the canvas budget (images only). */
  readonly cappedPages: number;
}

/** A group of consecutive pages found by the size split: indices into the pages given, inclusive. */
export interface SizeSpan {
  readonly from: number;
  readonly to: number;
  readonly size: number;
}

export type ImageJobPage =
  | {
      readonly kind: 'original';
      readonly sourceId: string;
      readonly pageIndex: number;
      readonly rotation: Rotation;
    }
  | {
      readonly kind: 'blank';
      readonly width: number;
      readonly height: number;
      readonly rotation: Rotation;
    };

/** Contract of the render worker (pdf.js). Only data crosses the boundary. */
export interface RenderWorkerApi {
  /** Opens a document and keeps it for later renders. Takes ownership of `bytes`. */
  open(sourceId: string, bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  /** Draws one page. `requestId` lets the caller cancel it; a cancelled render fails with kind `cancelled`. */
  render(
    requestId: number,
    sourceId: string,
    pageIndex: number,
    targetWidth: number,
  ): Promise<Result<RenderedPage<ImageBitmap>, PdfError>>;
  cancel(requestId: number): void;
  release(sourceId: string): Promise<void>;
  /** The bookmarks of an open document. */
  outline(sourceId: string): Promise<Result<OutlineEntry[], PdfError>>;
  /** Which image formats this browser can encode, so the dialog only offers what works. */
  encodableFormats(): Promise<readonly ImageExportOptions['format'][]>;
  /** Pages to pictures, one at a time, packed in a ZIP when there is more than one. */
  exportImages(
    jobId: number,
    pages: readonly ImageJobPage[],
    options: ImageExportOptions,
    baseName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<ProducedFile, PdfError>>;
  cancelJob(jobId: number): void;
}

/** Contract of the export worker (pdf-lib). It owns the source bytes once they are registered. */
export interface ExportWorkerApi {
  /** Checks the file and, if it is usable, keeps its bytes. Takes ownership of `bytes`. */
  register(sourceId: string, bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>>;
  /**
   * Turns a JPEG or PNG into a one-page PDF and keeps it as a source. Returns a copy of the PDF
   * for the render worker. Takes ownership of `bytes`.
   */
  registerImage(
    sourceId: string,
    bytes: Uint8Array,
    options: ImagePageOptions,
  ): Promise<Result<{ info: PdfInfo; pdf: Uint8Array }, PdfError>>;
  release(sourceId: string): void;
  /** Builds the files of a plan: one PDF, or a ZIP when there are several. */
  runPlan(
    jobId: number,
    outputs: readonly PlannedOutput[],
    archiveName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<ProducedFile, PdfError>>;
  /** Splits pages into files under a size limit, measuring the real PDFs. */
  splitBySize(
    jobId: number,
    pages: readonly PageRef[],
    limit: number,
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<SizeSpan[], SplitError>>;
  cancelJob(jobId: number): void;
}

export type { EncodedImage };
