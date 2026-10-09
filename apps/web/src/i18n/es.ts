export const es = {
  app: {
    name: 'Vidopdf',
    privacy: 'Tus archivos no salen de este dispositivo.',
  },
  topbar: {
    addFiles: 'Añadir archivos',
    export: 'Exportar',
    language: 'Idioma',
  },
  files: {
    heading: 'Archivos',
    pages_one: '{{count}} página',
    pages_other: '{{count}} páginas',
    none: 'Todavía no has cargado ningún PDF.',
  },
  empty: {
    title: 'Suelta tus PDFs aquí',
    hint: 'Únelos, divídelos, reordénalos y comprímelos sin subirlos a ningún servidor.',
    choose: 'Elegir archivos',
  },
  thumb: {
    alt: 'Primera página de {{name}}',
    loading: 'Dibujando la primera página de {{name}}…',
  },
  status: {
    loaded_one: 'Archivo cargado: {{name}}',
    loaded_other: '{{count}} archivos cargados',
    exported: 'PDF exportado: {{size}}',
    exporting: 'Exportando…',
  },
  errors: {
    empty: '{{name}}: el archivo está vacío o no tiene páginas.',
    corrupt: '{{name}}: no se pudo leer; está dañado o no es un PDF.',
    encrypted: '{{name}}: está protegido con contraseña o restricciones y todavía no se admite.',
    unsupported: '{{name}}: este tipo de PDF no se admite.',
    cancelled: 'Operación cancelada.',
    internal: '{{name}}: error inesperado. Prueba con otro archivo.',
    notPdf: '{{name}} no es un PDF y se ha ignorado.',
  },
  footer: {
    licenses: 'Licencias',
    version: 'Versión {{version}}',
  },
} as const;
