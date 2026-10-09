import { err, ok, pdfError, splitBySize, toExportPage } from '@vidopdf/core';
import type {
  CompressionOptions,
  Compressor,
  ImagePageOptions,
  PageRef,
  PdfError,
  PdfInfo,
  PdfWriter,
  Result,
  SplitError,
  ZipBuilder,
} from '@vidopdf/core';
import type { CompressionSummary, PlannedOutput, ProducedFile, SizeSpan } from './api';

export interface ExportCoreDeps {
  readonly writer: PdfWriter;
  readonly compressor: Compressor;
  readonly createZip: () => ZipBuilder;
}

const PDF = 'application/pdf';
const ZIP = 'application/zip';

/**
 * The work of the export worker, without the worker: keeps the source bytes, builds the files of a
 * plan and measures splits. Kept apart from `export.worker.ts` so it can be tested with fakes.
 */
export function createExportCore(deps: ExportCoreDeps) {
  const sources = new Map<string, Uint8Array>();
  const running = new Map<number, AbortController>();

  const track = (jobId: number): AbortController => {
    const controller = new AbortController();
    running.set(jobId, controller);
    return controller;
  };

  async function register(sourceId: string, bytes: Uint8Array): Promise<Result<PdfInfo, PdfError>> {
    const info = await deps.writer.inspect(bytes);
    if (info.ok) sources.set(sourceId, bytes);
    return info;
  }

  async function registerImage(
    sourceId: string,
    bytes: Uint8Array,
    options: ImagePageOptions,
  ): Promise<Result<{ info: PdfInfo; pdf: Uint8Array }, PdfError>> {
    const made = await deps.writer.fromImage(bytes, options);
    if (!made.ok) return made;
    const info = await register(sourceId, made.value);
    // The render worker gets its own copy; this one stays here for exporting.
    return info.ok ? ok({ info: info.value, pdf: made.value.slice() }) : info;
  }

  function release(sourceId: string): void {
    sources.delete(sourceId);
  }

  /**
   * Compresses a built PDF when the output asks for it. A file that cannot be compressed for a
   * reason of its own is handed back as built, with nothing gained, rather than failing the job.
   */
  async function compressed(
    output: PlannedOutput,
    built: Uint8Array,
    options: CompressionOptions,
  ): Promise<Result<{ bytes: Uint8Array; found: number; recompressed: number }, PdfError>> {
    const asBuilt = { bytes: built, found: 0, recompressed: 0 };
    if (output.compression === undefined) return ok(asBuilt);
    const result = await deps.compressor.compress(built, output.compression, options);
    if (result.ok) {
      const { bytes, report } = result.value;
      return ok({
        bytes,
        found: report.imagesFound,
        // Pictures that were redone but did not make the file smaller leave it as it was.
        recompressed: report.keptOriginal ? 0 : report.imagesRecompressed,
      });
    }
    return result.error.kind === 'cancelled' ? result : ok(asBuilt);
  }

  /** Gathers built PDFs: handed back as they are when there is one, packed in a ZIP when there are several. */
  function collector(outputs: readonly PlannedOutput[], archiveName: string) {
    const zip = outputs.length > 1 ? deps.createZip() : undefined;
    const total = outputs.reduce((sum, output) => sum + output.pages.length, 0);
    let single: ProducedFile | undefined;
    const summary = { bytesBefore: 0, bytesAfter: 0, picturesFound: 0, picturesRecompressed: 0 };
    const wanted = outputs.some((output) => output.compression !== undefined);
    const compression = (): { compression?: CompressionSummary } =>
      wanted ? { compression: { ...summary } } : {};
    return {
      total,
      count(before: number, after: number, found: number, recompressed: number): void {
        summary.bytesBefore += before;
        summary.bytesAfter += after;
        summary.picturesFound += found;
        summary.picturesRecompressed += recompressed;
      },
      add(output: PlannedOutput, bytes: Uint8Array): Result<void, PdfError> {
        if (zip === undefined) {
          single = {
            kind: 'pdf',
            name: output.name,
            mime: PDF,
            bytes,
            fileCount: 1,
            pageCount: output.pages.length,
            cappedPages: 0,
            ...compression(),
          };
          return ok(undefined);
        }
        // PDFs written without object streams compress well; a ZIP of them is much smaller.
        return zip.add(output.name, bytes, { deflate: true });
      },
      finish(): Result<ProducedFile, PdfError> {
        if (single !== undefined) return ok(single);
        const archive = zip?.finish();
        if (archive === undefined) return err(pdfError('empty', 'nothing to export'));
        if (!archive.ok) return archive;
        return ok({
          kind: 'zip',
          name: archiveName,
          mime: ZIP,
          bytes: archive.value,
          fileCount: outputs.length,
          pageCount: total,
          cappedPages: 0,
          ...compression(),
        });
      },
    };
  }

  async function runPlan(
    jobId: number,
    outputs: readonly PlannedOutput[],
    archiveName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<ProducedFile, PdfError>> {
    const controller = track(jobId);
    try {
      const files = collector(outputs, archiveName);
      // Compressing is about as much work as building, so each gets half of the bar.
      const weight = outputs.some((output) => output.compression !== undefined) ? 2 : 1;
      const total = files.total * weight;
      let finished = 0;
      for (const output of outputs) {
        if (controller.signal.aborted) return err(pdfError('cancelled'));
        const before = finished;
        const built = await deps.writer.assemble(sources, output.pages, {
          signal: controller.signal,
          onProgress: (done) => {
            onProgress(before + done, total);
          },
        });
        if (!built.ok) return built;
        finished += output.pages.length;
        const packed = await compressed(output, built.value, {
          signal: controller.signal,
          onProgress: (done, steps) => {
            onProgress(
              finished + Math.round((done / Math.max(1, steps)) * output.pages.length),
              total,
            );
          },
        });
        if (!packed.ok) return packed;
        if (output.compression !== undefined) {
          finished += output.pages.length;
          files.count(
            built.value.byteLength,
            packed.value.bytes.byteLength,
            packed.value.found,
            packed.value.recompressed,
          );
        }
        const added = files.add(output, packed.value.bytes);
        if (!added.ok) return added;
      }
      return files.finish();
    } finally {
      running.delete(jobId);
    }
  }

  async function splitPagesBySize(
    jobId: number,
    pages: readonly PageRef[],
    limit: number,
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<SizeSpan[], SplitError>> {
    const controller = track(jobId);
    try {
      const result = await splitBySize(
        pages,
        limit,
        async (group) => {
          const built = await deps.writer.assemble(
            sources,
            group.map((page) => toExportPage(page)),
            {
              signal: controller.signal,
            },
          );
          if (!built.ok) throw new Error(built.error.kind);
          return built.value.byteLength;
        },
        { signal: controller.signal, onProgress },
      );
      if (!result.ok) return result;
      return ok(
        result.value.map((group) => ({
          from: (group.span?.from ?? 1) - 1,
          to: (group.span?.to ?? 1) - 1,
          size: group.size,
        })),
      );
    } finally {
      running.delete(jobId);
    }
  }

  function cancelJob(jobId: number): void {
    running.get(jobId)?.abort();
  }

  return { register, registerImage, release, runPlan, splitBySize: splitPagesBySize, cancelJob };
}
