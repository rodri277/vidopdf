import type { FontFile } from '@vidopdf/pdf-adapters/pdf-lib';
import latin400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import latin700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import latinExt400 from '@fontsource/inter/files/inter-latin-ext-400-normal.woff?url';
import latinExt700 from '@fontsource/inter/files/inter-latin-ext-700-normal.woff?url';
import cyrillic400 from '@fontsource/inter/files/inter-cyrillic-400-normal.woff?url';
import cyrillic700 from '@fontsource/inter/files/inter-cyrillic-700-normal.woff?url';
import greek400 from '@fontsource/inter/files/inter-greek-400-normal.woff?url';
import greek700 from '@fontsource/inter/files/inter-greek-700-normal.woff?url';
import vietnamese400 from '@fontsource/inter/files/inter-vietnamese-400-normal.woff?url';
import vietnamese700 from '@fontsource/inter/files/inter-vietnamese-700-normal.woff?url';

const fetchBytes = (url: string) => async (): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the font ${url}`);
  return new Uint8Array(await response.arrayBuffer());
};

const file = (script: string, bold: boolean, url: string): FontFile => ({
  script,
  bold,
  load: fetchBytes(url),
});

/**
 * The files of Inter (OFL) the export worker may stamp text with, tried in this order and fetched
 * from this same site only when a character needs them. The page's own copy of Inter, the
 * variable one used by the interface, is a different file and is not used here (ADR 006).
 */
export const interFiles: readonly FontFile[] = [
  file('latin', false, latin400),
  file('latin-ext', false, latinExt400),
  file('cyrillic', false, cyrillic400),
  file('greek', false, greek400),
  file('vietnamese', false, vietnamese400),
  file('latin', true, latin700),
  file('latin-ext', true, latinExt700),
  file('cyrillic', true, cyrillic700),
  file('greek', true, greek700),
  file('vietnamese', true, vietnamese700),
];
