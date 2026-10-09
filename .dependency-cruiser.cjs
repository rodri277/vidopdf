const { join } = require('node:path');

const PDF_LIBS = '(^|node_modules/)(pdfjs-dist|@cantoo/pdf-lib|pdf-lib)(/|$)';

/** Layer rules from SPEC.md "Arquitectura". Enforced in CI via `pnpm deps:check`. */
module.exports = {
  forbidden: [
    {
      name: 'core-imports-nothing-outside-itself',
      comment:
        'packages/core is pure domain code: no DOM, no React, no PDF libraries, no other package.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { pathNot: '^packages/core/src' },
    },
    {
      name: 'adapters-only-import-core-and-pdf-libs',
      comment: 'pdf-adapters may depend on core and the PDF engines, never on the web app.',
      severity: 'error',
      from: { path: '^packages/pdf-adapters/src' },
      to: {
        pathNot: ['^packages/pdf-adapters/src', '^packages/core/src', PDF_LIBS, '^@vidopdf/core$'],
        dependencyTypesNot: ['core'],
      },
    },
    {
      name: 'ui-never-imports-pdf-libs',
      comment: 'The UI never imports pdfjs-dist or pdf-lib directly; only adapters do.',
      severity: 'error',
      from: { path: '^apps/web/src' },
      to: { path: PDF_LIBS },
    },
    {
      name: 'pdf-work-only-in-workers',
      comment:
        'Rendering, export and OCR run in workers. Only src/workers may import pdf-adapters.',
      severity: 'error',
      from: { path: '^apps/web/src', pathNot: '^apps/web/src/workers/' },
      to: { path: '^packages/pdf-adapters/|^@vidopdf/pdf-adapters$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: join(__dirname, 'tsconfig.base.json') },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.tsx?$|/e2e/|/testing/' },
  },
};
