import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { FontFile } from '../fonts/font-session';

const require = createRequire(import.meta.url);
const directory = require
  .resolve('@fontsource/inter/package.json')
  .replace('package.json', 'files/');

const SCRIPTS = ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'] as const;

/** The Inter files of the app, read from node_modules, for tests and benchmarks in Node. */
export const nodeFonts: readonly FontFile[] = SCRIPTS.flatMap((script) =>
  ([400, 700] as const).map((weight) => ({
    script,
    bold: weight === 700,
    load: () =>
      Promise.resolve(
        new Uint8Array(readFileSync(`${directory}inter-${script}-${String(weight)}-normal.woff`)),
      ),
  })),
);
