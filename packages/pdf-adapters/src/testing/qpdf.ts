import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Throws when qpdf finds structural errors. qpdf is a test-only tool, independent of our code. */
export function qpdfCheck(bytes: Uint8Array): void {
  const file = join(mkdtempSync(join(tmpdir(), 'vidopdf-')), 'out.pdf');
  writeFileSync(file, bytes);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
}
