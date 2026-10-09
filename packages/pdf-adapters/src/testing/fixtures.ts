import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../../tests/fixtures/generated');

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(dir, name)));
}
