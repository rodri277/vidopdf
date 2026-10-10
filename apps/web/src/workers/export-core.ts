import {
  ALL_ALLOWED,
  decodePermissions,
  err,
  ok,
  pdfError,
  protectionFor,
  splitBySize,
  toExportPage,
} from '@vidopdf/core';
import type {
  CompressionOptions,
  FormInfo,
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
import type {
  CompressionSummary,
  PlannedOutput,
  ProtectionSummary,
  ProducedFile,
  SizeSpan,
  SplitFinishing,
} from './api';

export interface ExportCoreDeps {
  readonly writer: PdfWriter;
  /** A password nobody keeps (for the owner of a protected result). */
  readonly randomPassword: () => string;
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
  const assets = new Map<string, Uint8Array>();
  /** Typed by the user for protected files; in memory only, gone when the file is released. */
  const passwords = new Map<string, string>();
  /** The `/P` value of files whose owner restricted something (ADR 006). */
  const restrictions = new Map<string, number>();
  const running = new Map<number, AbortController>();

  const track = (jobId: number): AbortController => {
    const controller = new AbortController();
    running.set(jobId, controller);
    return controller;
  };

  async function register(
    sourceId: string,
    bytes: Uint8Array,
    password?: string,
  ): Promise<Result<PdfInfo, PdfError>> {
    const info = await deps.writer.inspect(bytes, password);
    if (!info.ok) return info;
    sources.set(sourceId, bytes);
    if (password !== undefined) passwords.set(sourceId, password);
    if (info.value.restrictions !== undefined) restrictions.set(sourceId, info.value.restrictions);
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
    passwords.delete(sourceId);
    restrictions.delete(sourceId);
  }

  async function readForm(sourceId: string): Promise<Result<FormInfo, PdfError>> {
    const bytes = sources.get(sourceId);
    return bytes === undefined
      ? err(pdfError('internal', `unknown source ${sourceId}`))
      : deps.writer.readForm(bytes, passwords.get(sourceId));
  }

  function registerAsset(assetId: string, bytes: Uint8Array): void {
    assets.set(assetId, bytes);
  }

  function releaseAsset(assetId: string): void {
    assets.delete(assetId);
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

  /**
   * Protects an output as the user chose, plus whatever its sources restricted: those restrictions
   * are never lifted, and the owner password for them is one nobody keeps (ADR 006).
   */
  async function protectOutput(
    output: PlannedOutput,
    bytes: Uint8Array,
  ): Promise<Result<{ bytes: Uint8Array; summary?: ProtectionSummary }, PdfError>> {
    const used = new Set(
      output.pages.flatMap((page) => (page.kind === 'original' ? [page.sourceId] : [])),
    );
    const inherited = [...used].flatMap((id) => {
      const p = restrictions.get(id);
      return p === undefined ? [] : [decodePermissions(p)];
    });
    const protection = protectionFor(output.protect, inherited, deps.randomPassword);
    if (protection === undefined) return ok({ bytes });
    const result = await deps.writer.protect(bytes, protection.options);
    if (!result.ok) return result;
    return ok({
      bytes: result.value,
      summary: {
        needsPassword: protection.options.userPassword !== '',
        inheritedRestrictions: protection.inherited,
      },
    });
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
    let protection: ProtectionSummary | undefined;
    const withProtection = (): { protection?: ProtectionSummary } =>
      protection === undefined ? {} : { protection };
    return {
      total,
      noteProtection(next: ProtectionSummary | undefined): void {
        if (next === undefined) return;
        protection = {
          needsPassword: (protection?.needsPassword ?? false) || next.needsPassword,
          inheritedRestrictions:
            (protection?.inheritedRestrictions ?? false) || next.inheritedRestrictions,
        };
      },
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
            ...withProtection(),
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
          ...withProtection(),
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
          assets,
          passwords,
          ...(output.decorations === undefined ? {} : { decorations: output.decorations }),
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
        const secured = await protectOutput(output, packed.value.bytes);
        if (!secured.ok) return secured;
        files.noteProtection(secured.value.summary);
        const added = files.add(output, secured.value.bytes);
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
    finishing?: SplitFinishing,
  ): Promise<Result<SizeSpan[], SplitError>> {
    const controller = track(jobId);
    try {
      const result = await splitBySize(
        pages,
        limit,
        async (group) => {
          const built = await deps.writer.assemble(
            sources,
            group.map((page) => toExportPage(page, finishing?.edits[page.id])),
            {
              signal: controller.signal,
              assets,
              passwords,
              ...(finishing === undefined ? {} : { decorations: finishing.decorations }),
            },
          );
          if (!built.ok) throw new Error(built.error.kind);
          if (finishing?.protect !== true) return built.value.byteLength;
          // Encrypting adds a little to every file: measure it with the protection on.
          const secured = await deps.writer.protect(built.value, {
            userPassword: 'x',
            ownerPassword: deps.randomPassword(),
            permissions: ALL_ALLOWED,
          });
          if (!secured.ok) throw new Error(secured.error.kind);
          return secured.value.byteLength;
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

  return {
    register,
    registerImage,
    release,
    readForm,
    registerAsset,
    releaseAsset,
    runPlan,
    splitBySize: splitPagesBySize,
    cancelJob,
  };
}
