import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

interface VercelHeaders {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

/** vercel.json is the single source of the security headers; `vite preview` serves the same ones. */
function securityHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as VercelHeaders;
  const all = config.headers.find((entry) => entry.source === '/(.*)');
  return Object.fromEntries((all?.headers ?? []).map(({ key, value }) => [key, value]));
}

// pdfjs-dist is a dependency of the adapters package, not of the app, so resolve it from there.
const pdfjsDir = dirname(
  createRequire(join(root, 'packages/pdf-adapters/package.json')).resolve(
    'pdfjs-dist/package.json',
  ),
);

/** Files of pdfjs-dist served from /pdfjs/ (same origin, so the CSP can stay strict). */
const PDFJS_ASSETS = ['cmaps', 'standard_fonts', 'iccs', 'wasm'] as const;
// Not served on purpose:
// - quickjs-eval is pdf.js' sandbox for embedded JavaScript; Vidopdf never runs PDF scripts.
// - Liberation fonts are the only GPL piece in pdf.js (ADR 005); we ship none.
const excluded = (path: string) =>
  path.includes('quickjs-eval') || path.toLowerCase().includes('liberation');

const MIME: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
};

function pdfjsAssets(): Plugin {
  const source = (url: string): string | undefined => {
    const relative = normalize(decodeURIComponent(url.split('?')[0] ?? '')).replace(
      /^\/?pdfjs\//,
      '',
    );
    const file =
      relative === 'pdf.worker.min.mjs'
        ? join(pdfjsDir, 'build', relative)
        : join(pdfjsDir, relative);
    const inside = file.startsWith(pdfjsDir) && !excluded(file);
    return inside && existsSync(file) && statSync(file).isFile() ? file : undefined;
  };
  return {
    name: 'vidopdf-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const file = source(`/pdfjs${req.url ?? ''}`);
        if (file === undefined) {
          next();
          return;
        }
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const out = join(here, 'dist/pdfjs');
      mkdirSync(out, { recursive: true });
      cpSync(join(pdfjsDir, 'build/pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
      for (const name of PDFJS_ASSETS) {
        cpSync(join(pdfjsDir, name), join(out, name), {
          recursive: true,
          filter: (path) => !excluded(path),
        });
      }
      // The notices must travel with the deployed site, not only with the repository.
      cpSync(join(root, 'THIRD_PARTY_LICENSES.md'), join(here, 'dist/THIRD_PARTY_LICENSES.txt'));
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  worker: { format: 'es' },
  build: { target: 'es2023', sourcemap: true, assetsInlineLimit: 0 },
  preview: { headers: securityHeaders() },
});
