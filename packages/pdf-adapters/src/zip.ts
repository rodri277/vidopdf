import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { err, ok, pdfError } from '@vidopdf/core';
import type { PdfError, Result, ZipBuilder, ZipOptions } from '@vidopdf/core';

export interface ZipBuilderOptions {
  /** Stored as every entry's modification time. Defaults to now; tests fix it for stable output. */
  readonly mtime?: Date;
}

/** A name that could write outside the folder the ZIP is unpacked into. */
function isUnsafe(name: string): boolean {
  return name === '' || /^[/\\]/.test(name) || name.split(/[/\\]/).includes('..');
}

function join(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** ZIP writer on fflate. Each entry is written as it is added, so pages never pile up twice. */
export function createZipBuilder(options: ZipBuilderOptions = {}): ZipBuilder {
  const chunks: Uint8Array[] = [];
  const names = new Set<string>();
  let failure: Error | undefined;
  let finished = false;
  const archive = new Zip((error, chunk) => {
    if (error !== null) failure = error;
    else chunks.push(chunk);
  });
  const mtime = options.mtime ?? new Date();

  return {
    add(name: string, bytes: Uint8Array, entry: ZipOptions = {}): Result<void, PdfError> {
      if (finished) return err(pdfError('internal', 'zip already finished'));
      if (isUnsafe(name)) return err(pdfError('internal', `unsafe entry name: ${name}`));
      if (names.has(name.toLowerCase()))
        return err(pdfError('internal', `duplicate entry: ${name}`));
      names.add(name.toLowerCase());
      const file =
        entry.deflate === true ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      file.mtime = mtime;
      archive.add(file);
      file.push(bytes, true);
      return failure === undefined ? ok(undefined) : err(pdfError('internal', failure.message));
    },
    finish(): Result<Uint8Array, PdfError> {
      if (finished) return err(pdfError('internal', 'zip already finished'));
      finished = true;
      archive.end();
      return failure === undefined ? ok(join(chunks)) : err(pdfError('internal', failure.message));
    },
  };
}
