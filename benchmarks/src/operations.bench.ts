import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { files } from './fixtures';
import { SLOWDOWNS, loadDocuments, openApp, record, throttle, waitForThumbnails } from './harness';
import { round } from './stats';

test.setTimeout(15 * 60_000);

async function openExportTab(page: Page, tab: string) {
  await page.getByRole('banner').getByRole('button', { name: 'Exportar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exportar' });
  await dialog.getByRole('radio', { name: tab }).check();
  return dialog;
}

for (const slowdown of SLOWDOWNS) {
  test(`split by size, pictures and extraction on 500 pages, CPU ${String(slowdown)}x slower`, async ({
    page,
  }) => {
    await openApp(page);
    await throttle(page, slowdown);
    await loadDocuments(page, [files.text500], 500);
    await waitForThumbnails(page);
    const base = { cpuSlowdown: slowdown };

    // Split by size: measuring builds real PDFs, so this is the slowest preview.
    let dialog = await openExportTab(page, 'Dividir');
    await dialog.getByRole('radio', { name: 'Por tamaño máximo' }).check();
    await dialog.getByLabel('Tamaño máximo por archivo').fill('100');
    await dialog.getByLabel('Unidad').selectOption('KB');
    let started = Date.now();
    await dialog.getByRole('button', { name: 'Calcular el reparto' }).click();
    await expect(dialog.getByRole('heading', { name: /Se crearán \d+ archivos/ })).toBeVisible({
      timeout: 300_000,
    });
    record({
      ...base,
      scenario: 'Split 500 pages by size (100 KB)',
      metric: 'working out the split',
      value: Date.now() - started,
      unit: 'ms',
    });
    started = Date.now();
    await dialog.getByRole('button', { name: 'Dividir y preparar el ZIP' }).click();
    await expect(dialog.locator('.result-name')).toBeVisible({ timeout: 300_000 });
    record({
      ...base,
      scenario: 'Split 500 pages by size (100 KB)',
      metric: 'building the ZIP',
      value: Date.now() - started,
      unit: 'ms',
    });
    await dialog.getByRole('button', { name: 'Volver' }).click();

    // Pictures of the first 100 pages.
    await dialog.getByRole('radio', { name: 'Imágenes' }).check();
    await dialog.getByRole('radio', { name: 'PNG (sin pérdida)' }).check();
    await dialog.getByLabel(/Resolución/).fill('150');
    started = Date.now();
    await dialog.getByRole('button', { name: 'Crear imágenes' }).click();
    await expect(dialog.locator('.result-name')).toBeVisible({ timeout: 600_000 });
    record({
      ...base,
      scenario: 'Pictures of 500 pages (PNG, 150 DPI)',
      metric: 'time',
      value: Date.now() - started,
      unit: 'ms',
    });
    await dialog.getByRole('button', { name: 'Volver' }).click();
    await page.keyboard.press('Escape');

    // The whole document as one PDF.
    dialog = await openExportTab(page, 'Un PDF');
    started = Date.now();
    await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
    await expect(dialog.locator('.result-name')).toBeVisible({ timeout: 300_000 });
    record({
      ...base,
      scenario: 'Export 500 pages as one PDF',
      metric: 'time',
      value: Date.now() - started,
      unit: 'ms',
    });
    expect(round(Date.now() - started)).toBeGreaterThan(0);
  });
}
