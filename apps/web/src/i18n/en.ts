import type { es } from './es';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export const en: Widen<typeof es> = {
  app: {
    name: 'Vidopdf',
    privacy: 'Your files never leave this device.',
  },
  topbar: {
    addFiles: 'Add files',
    export: 'Export',
    language: 'Language',
  },
  files: {
    heading: 'Files',
    pages_one: '{{count}} page',
    pages_other: '{{count}} pages',
    none: 'No PDFs loaded yet.',
  },
  empty: {
    title: 'Drop your PDFs here',
    hint: 'Merge, split, reorder and compress them without uploading them to any server.',
    choose: 'Choose files',
  },
  thumb: {
    alt: 'First page of {{name}}',
    loading: 'Drawing the first page of {{name}}…',
  },
  status: {
    loaded_one: 'File loaded: {{name}}',
    loaded_other: '{{count}} files loaded',
    exported: 'PDF exported: {{size}}',
    exporting: 'Exporting…',
  },
  errors: {
    empty: '{{name}}: the file is empty or has no pages.',
    corrupt: "{{name}}: couldn't be read; it is damaged or not a PDF.",
    encrypted: '{{name}}: is protected by a password or restrictions, which is not supported yet.',
    unsupported: "{{name}}: this kind of PDF isn't supported.",
    cancelled: 'Operation cancelled.',
    internal: '{{name}}: unexpected error. Try another file.',
    notPdf: '{{name}} is not a PDF and was ignored.',
  },
  footer: {
    licenses: 'Licenses',
    version: 'Version {{version}}',
  },
};
