import type {
  CompressionPreset,
  Decorations,
  EditsByPage,
  FormInfo,
  ProtectChoice,
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
  /** Recompress the pictures of the built PDF with this preset. */
  readonly compression?: CompressionPreset;
  /** What the user chose for protecting the result; the restrictions of the sources are added by the worker. */
  readonly protect?: ProtectChoice;
  /** Stamps, metadata, bookmarks and form values to apply while the pages are assembled. */
  readonly decorations?: Decorations;
}

/** What is done to the pages of a split besides cutting them, because it changes their size. */
export interface SplitFinishing {
  readonly decorations: Decorations;
  readonly edits: EditsByPage;
  /** The files will be protected, which adds a little to their size. */
  readonly protect?: boolean;
}

/** What compression did to a finished download, so the dialog can show it before saving. */
/** How a finished download is protected. */
export interface ProtectionSummary {
  /** The result needs a password to be opened. */
  readonly needsPassword: boolean;
  /** Some restrictions came from the files it was made from and are kept. */
  readonly inheritedRestrictions: boolean;
}

export interface CompressionSummary {
  /** Size of the files as they were assembled, before compression. */
  readonly bytesBefore: number;
  /** Their size after compression (the files themselves, not the ZIP around them). */
  readonly bytesAfter: number;
  readonly picturesFound: number;
  readonly picturesRecompressed: number;
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
  /** Present when the job asked for compression. */
  readonly compression?: CompressionSummary;
  /** Present when the result is protected, by choice or because its sources were restricted. */
  readonly protection?: ProtectionSummary;
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
  open(
    sourceId: string,
    bytes: Uint8Array,
    /** The password of a protected file, typed by the user. */
    password?: string,
  ): Promise<Result<PdfInfo, PdfError>>;
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
  register(
    sourceId: string,
    bytes: Uint8Array,
    /** The password of a protected file, typed by the user; kept in memory until the file is released. */
    password?: string,
  ): Promise<Result<PdfInfo, PdfError>>;
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
  /**
   * Keeps a picture (a PNG or JPEG) that stamps and signatures refer to by `assetId`. Takes
   * ownership of `bytes`.
   */
  registerAsset(assetId: string, bytes: Uint8Array): void;
  releaseAsset(assetId: string): void;
  /** The fields of the form of a registered file, to offer a way to fill them. */
  readForm(sourceId: string): Promise<Result<FormInfo, PdfError>>;
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
    /** What will be stamped and cropped on the files, so the measured sizes include it. */
    finishing?: SplitFinishing,
  ): Promise<Result<SizeSpan[], SplitError>>;
  cancelJob(jobId: number): void;
}

export type { EncodedImage };
