import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { files } from './fixtures';
import {
  SLOWDOWNS,
  loadDocuments,
  openApp,
  record,
  startMonitor,
  stopMonitor,
  throttle,
} from './harness';
import { round } from './stats';

test.setTimeout(10 * 60_000);

/** Every distinct value the progress bar shows while the export runs. */
async function watchProgress(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const seen = new Set<number>();
    const deadline = performance.now() + 120_000;
    while (performance.now() < deadline) {
      const bar = document.querySelector('dialog[open] progress');
      if (bar instanceof HTMLProgressElement) seen.add(bar.value);
      else if (seen.size > 0 || document.querySelector('dialog[open] .result-name') !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return [...seen].sort((a, b) => a - b);
  });
}

for (const slowdown of SLOWDOWNS) {
  test(`merging 20 files and 500 pages, CPU ${String(slowdown)}x slower`, async ({ page }) => {
    await openApp(page);
    await throttle(page, slowdown);
    const paths = Array.from({ length: 20 }, (_, index) => files.merge(index));

    await startMonitor(page);
    const loadMs = await loadDocuments(page, paths, 500);
    const loading = await stopMonitor(page);

    await page.getByRole('banner').getByRole('button', { name: 'Exportar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Exportar' });
    await startMonitor(page);
    const started = Date.now();
    await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
    const progress = await watchProgress(page);
    await expect(dialog.locator('.result-name')).toBeVisible({ timeout: 120_000 });
    const exportMs = Date.now() - started;
    const exporting = await stopMonitor(page);

    const base = { scenario: 'Merge 20 files, 500 pages', cpuSlowdown: slowdown };
    record({ ...base, metric: 'loading the 20 files', value: loadMs, unit: 'ms' });
    record({
      ...base,
      metric: 'worst frame while loading',
      value: round(loading.frames.worstMs),
      unit: 'ms',
    });
    record({
      ...base,
      metric: 'long tasks while loading',
      value: loading.longTasks,
      unit: 'tasks',
      budget: 0,
    });
    record({ ...base, metric: 'building the merged PDF', value: exportMs, unit: 'ms' });
    record({
      ...base,
      metric: 'distinct progress values shown while exporting',
      value: progress.length,
      unit: 'values',
      budget: 5,
      atLeast: true,
    });
    record({
      ...base,
      metric: 'worst frame while exporting',
      value: round(exporting.frames.worstMs),
      unit: 'ms',
    });
    record({
      ...base,
      metric: 'long tasks while exporting',
      value: exporting.longTasks,
      unit: 'tasks',
      budget: 0,
    });
    record({
      ...base,
      metric: 'longest task while exporting',
      value: round(exporting.longestTaskMs),
      unit: 'ms',
      budget: 50,
    });
  });
}
