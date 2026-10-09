import type { es } from './es';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export const en: Widen<typeof es> = {
  app: {
    name: 'Vidopdf',
    privacy: 'Your files never leave this device.',
  },
  topbar: {
    addFiles: 'Add files',
    undo: 'Undo',
    redo: 'Redo',
    nothingToUndo: 'Nothing to undo',
    nothingToRedo: 'Nothing to redo',
    export: 'Export',
    language: 'Language',
  },
  history: {
    add: 'add pages',
    remove: 'delete pages',
    restore: 'restore pages',
    move: 'move pages',
    rotate: 'rotate pages',
    duplicate: 'duplicate pages',
    insertBlank: 'insert blank page',
  },
  grid: {
    label: 'Document pages',
    blank: 'blank page',
    page: 'Page {{n}}',
    pageOf: 'Page {{n}} of {{total}}, {{name}}',
    selected: 'selected',
  },
  memory: {
    warning: '{{size}} loaded. With this much content the browser may slow down.',
  },
  files: {
    heading: 'Files',
    loading: 'Reading {{count}} file(s)…',
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
    exporting: 'Exporting… {{done}} of {{total}} pages',
    cancel: 'Cancel',
    ready: '{{pages}} pages · {{size}}',
    save: 'Save',
    failed: 'The PDF could not be exported.',
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
