// Runs Lighthouse (desktop preset) against the production build served by `vite preview`, which
// sends the same security headers as Vercel, and fails if any category falls under the floor.
//   node tools/lighthouse.mjs            check (CI); build first with `pnpm build`
//   node tools/lighthouse.mjs --write    also rewrite benchmarks/LIGHTHOUSE.md
// The floor is 95 (SPEC); the aim is 100. LH_MIN overrides it, LH_RUNS sets runs per page.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse, { desktopConfig } from 'lighthouse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://localhost:4173';
const floor = Number(process.env.LH_MIN ?? 95);
const runs = Number(process.env.LH_RUNS ?? 3);
const pages = ['/', '/privacy'];
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function startServer() {
  const server = spawn(
    'pnpm',
    ['--filter', '@vidopdf/web', 'exec', 'vite', 'preview', '--port', '4173', '--strictPort'],
    {
      cwd: root,
      stdio: 'ignore',
    },
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(origin)).ok) return server;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  server.kill();
  throw new Error('The preview server did not start (is something already on port 4173?)');
}

/** Chrome comes from Playwright's install, so CI and laptops need nothing extra. */
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const require = createRequire(join(root, 'apps/web/package.json'));
  return require('@playwright/test').chromium.executablePath();
}

const server = await startServer();
const chrome = await launch({
  chromePath: chromePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

const rows = [];
try {
  for (const path of pages) {
    const results = [];
    for (let run = 0; run < runs; run++) {
      const { lhr } = await lighthouse(
        `${origin}${path}`,
        { port: chrome.port, onlyCategories: categories, logLevel: 'error' },
        desktopConfig,
      );
      results.push(lhr);
    }
    const scores = Object.fromEntries(
      categories.map((id) => [
        id,
        median(results.map((lhr) => Math.round((lhr.categories[id]?.score ?? 0) * 100))),
      ]),
    );
    const metric = (id) => median(results.map((lhr) => lhr.audits[id]?.numericValue ?? 0));
    rows.push({
      path,
      scores,
      fcp: metric('first-contentful-paint'),
      lcp: metric('largest-contentful-paint'),
      tbt: metric('total-blocking-time'),
      cls: metric('cumulative-layout-shift'),
    });
  }
} finally {
  await chrome.kill();
  server.kill();
}

const table = [
  '| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${r.path} | ${categories.map((id) => String(r.scores[id])).join(' | ')} | ${(r.fcp / 1000).toFixed(1)} s | ${(r.lcp / 1000).toFixed(1)} s | ${Math.round(r.tbt)} ms | ${r.cls.toFixed(3)} |`,
  ),
];
process.stdout.write(`${table.join('\n')}\n`);

if (process.argv.includes('--write')) {
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(root, 'benchmarks/LIGHTHOUSE.md'),
    [
      '# Lighthouse',
      '',
      `Measured on ${date} with \`pnpm lighthouse\`: Lighthouse ${createRequire(import.meta.url)('lighthouse/package.json').version} desktop preset, headless Chromium from Playwright, the production build served by \`vite preview\` with the deployed security headers, median of ${String(runs)} runs per page, on a laptop (CI numbers vary). Floor 95, aim 100.`,
      '',
      ...table,
      '',
    ].join('\n'),
  );
}

const failing = rows.flatMap((r) =>
  categories
    .filter((id) => r.scores[id] < floor)
    .map((id) => `${r.path} ${id} ${String(r.scores[id])}`),
);
if (failing.length > 0) {
  process.stderr.write(`Below ${String(floor)}: ${failing.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`All categories at ${String(floor)} or more.\n`);
