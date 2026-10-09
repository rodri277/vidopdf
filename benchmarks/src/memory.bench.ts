import { statSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { files } from './fixtures';
import { MB, MemoryProbe, loadDocuments, openApp, record, waitForThumbnails } from './harness';
import type { Measurement } from './harness';
import { round } from './stats';

test.setTimeout(15 * 60_000);

const mb = (bytes: number) => round(bytes / MB);
const at = (scenario: string, metric: string, bytes: number): Measurement => ({
  scenario,
  metric,
  value: mb(bytes),
  unit: 'MB',
  cpuSlowdown: 1,
});

async function scrollThroughEverything(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const grid = document.getElementById('page-grid');
    if (grid === null) throw new Error('no grid');
    // Jump a screen at a time, giving the thumbnails a moment, until the end: the cache fills up.
    for (let top = 0; top < grid.scrollHeight; top += grid.clientHeight) {
      grid.scrollTo(0, top);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  });
}

/**
 * Every scenario runs in a browser context of its own, which gets its own renderer process, so the
 * numbers do not leak from one to the next.
 */
for (const [label, path, pages] of [
  ['500 text pages', files.text500, 500],
  ['500 scanned pages', files.scan500, 500],
] as const) {
  test(`memory with ${label}`, async ({ browser }) => {
    const probe = await MemoryProbe.create(browser);
    const context = await browser.newContext({
      baseURL: 'http://localhost:4174',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await openApp(page);
    await page.waitForTimeout(500);
    const scenario = `Memory, ${label}`;
    const fileBytes = statSync(path).size;
    const baseline = await probe.rendererBytes();

    const loading = await probe.peakDuring(async () => {
      await loadDocuments(page, [path], pages);
      await waitForThumbnails(page);
      await page.waitForTimeout(800);
    });
    const afterLoad = await probe.rendererBytes();
    await scrollThroughEverything(page);
    await page.waitForTimeout(800);
    const afterScroll = await probe.rendererBytes();

    record(at(scenario, 'empty application', baseline));
    record({
      scenario,
      metric: 'size of the PDF',
      value: mb(fileBytes),
      unit: 'MB',
      cpuSlowdown: 1,
    });
    record(at(scenario, 'peak while loading', loading.peak));
    record(at(scenario, 'after loading, first thumbnails drawn', afterLoad));
    record(at(scenario, 'after scrolling through every page', afterScroll));
    record({
      scenario,
      metric: 'memory added per MB of PDF (after scrolling)',
      value: round((afterScroll - baseline) / fileBytes, 2),
      unit: 'MB per MB',
      cpuSlowdown: 1,
    });

    const exported = await probe.peakDuring(async () => {
      await page.getByRole('banner').getByRole('button', { name: 'Exportar' }).click();
      const dialog = page.getByRole('dialog', { name: 'Exportar' });
      await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
      await expect(dialog.locator('.result-name')).toBeVisible({ timeout: 300_000 });
    });
    record(at(scenario, 'peak while exporting one PDF', exported.peak));
    await context.close();
  });
}

test('memory while creating pictures from 500 scanned pages', async ({ browser }) => {
  const probe = await MemoryProbe.create(browser);
  const context = await browser.newContext({
    baseURL: 'http://localhost:4174',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await openApp(page);
  await loadDocuments(page, [files.scan500], 500);
  await waitForThumbnails(page);
  await page.waitForTimeout(800);
  const before = await probe.rendererBytes();

  await page.getByRole('banner').getByRole('button', { name: 'Exportar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exportar' });
  await dialog.getByRole('radio', { name: 'Imágenes' }).check();
  await dialog.getByRole('radio', { name: 'JPEG' }).check();
  await dialog.getByLabel(/Resolución/).fill('150');
  const started = Date.now();
  const made = await probe.peakDuring(async () => {
    await dialog.getByRole('button', { name: 'Crear imágenes' }).click();
    await expect(dialog.locator('.result-name')).toBeVisible({ timeout: 600_000 });
  });
  const scenario = 'Pictures from 500 scanned pages (JPEG, 150 DPI)';
  record(at(scenario, 'before', before));
  record(at(scenario, 'peak while creating the ZIP', made.peak));
  record({ scenario, metric: 'time', value: Date.now() - started, unit: 'ms', cpuSlowdown: 1 });
  await context.close();
});

test('time and memory while compressing 500 scanned pages', async ({ browser }) => {
  const probe = await MemoryProbe.create(browser);
  const context = await browser.newContext({
    baseURL: 'http://localhost:4174',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await openApp(page);
  await loadDocuments(page, [files.scanSharp500], 500);
  await waitForThumbnails(page);
  await page.waitForTimeout(800);
  const before = await probe.rendererBytes();

  await page.getByRole('banner').getByRole('button', { name: 'Exportar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exportar' });
  await dialog.getByRole('radio', { name: /^Equilibrado/ }).check();
  const started = Date.now();
  const made = await probe.peakDuring(async () => {
    await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
    await expect(dialog.locator('.result-name')).toBeVisible({ timeout: 900_000 });
  });
  const elapsed = Date.now() - started;
  const summary = (await dialog.getByText(/Antes de comprimir|No había nada/).textContent()) ?? '';
  const sizes = /Antes de comprimir: ([\d.,]+) (\w+)\. Ahora: ([\d.,]+) (\w+)/.exec(summary);
  const scenario = 'Compress 500 scanned pages (balanced)';
  record(at(scenario, 'before', before));
  record(at(scenario, 'peak while building and compressing', made.peak));
  record({ scenario, metric: 'time', value: elapsed, unit: 'ms', cpuSlowdown: 1 });
  record({
    scenario,
    metric: 'reduction of the file',
    value: Number(/(\d+) % menos/.exec(summary)?.[1] ?? 0),
    unit: '%',
    cpuSlowdown: 1,
  });
  expect(sizes).not.toBeNull();
  record({
    scenario,
    metric: 'size of the PDF',
    value: mb(statSync(files.scanSharp500).size),
    unit: 'MB',
    cpuSlowdown: 1,
  });
  await context.close();
});
