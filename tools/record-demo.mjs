// Records the GIF of the README: load three PDFs, edit the pages, compress and export.
// Uses code-generated fixtures only. Needs ffmpeg. Build first (`pnpm build`), then:
//   node tools/record-demo.mjs
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://localhost:4173';
const fixtures = join(root, 'tests/fixtures/generated');
const { chromium } = createRequire(join(root, 'apps/web/package.json'))('@playwright/test');

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
    if ((await fetch(origin)).ok) break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const videos = mkdtempSync(join(tmpdir(), 'vidopdf-demo-'));
const size = { width: 1100, height: 660 };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  recordVideo: { dir: videos, size },
});
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

try {
  await page.addInitScript(() => Reflect.deleteProperty(globalThis, 'showSaveFilePicker'));
  await page.goto(origin);
  await pause(900);
  await page
    .getByTestId('file-input')
    .setInputFiles(
      ['photos-heavy-2p.pdf', 'mixed-sizes-3p.pdf', 'rotated-2p.pdf'].map((name) =>
        join(fixtures, name),
      ),
    );
  await page.getByRole('option').nth(6).locator('canvas').waitFor();
  await pause(1200);
  await page.getByRole('option').nth(2).click();
  await pause(600);
  await page.keyboard.press('r');
  await pause(700);
  await page.keyboard.press('r');
  await pause(700);
  await page.getByRole('option').nth(4).click();
  await pause(500);
  await page.keyboard.press('Delete');
  await pause(900);
  await page.keyboard.press('ControlOrMeta+z');
  await pause(900);
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Exportar$/ })
    .click();
  await pause(900);
  const dialog = page.getByRole('dialog', { name: 'Exportar' });
  await dialog.getByRole('radio', { name: /^Equilibrado/ }).check();
  await pause(1200);
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
  await dialog.getByText(/Antes de comprimir/).waitFor();
  await pause(2800);
} finally {
  await context.close();
  await browser.close();
  server.kill();
}

const video = join(
  videos,
  readdirSync(videos).find((name) => name.endsWith('.webm')),
);
const palette = join(videos, 'palette.png');
const out = join(root, 'docs/media/demo.gif');
const filters = 'fps=10,scale=880:-1:flags=lanczos';
spawnSync('ffmpeg', ['-y', '-i', video, '-vf', `${filters},palettegen=max_colors=96`, palette], {
  stdio: 'ignore',
});
spawnSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    video,
    '-i',
    palette,
    '-lavfi',
    `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4`,
    out,
  ],
  { stdio: 'ignore' },
);
rmSync(videos, { recursive: true, force: true });
process.stdout.write(`Wrote ${out}\n`);
