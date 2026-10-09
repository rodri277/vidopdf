import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  fixture,
  openApp,
  openExportDialog,
  pageCards,
  pdfPageCount,
  saveResult,
  watch,
} from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ORIGINAL_SIZE = 1_142_898; // photos-heavy-2p.pdf

async function loadPhotos(page: Page) {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('photos-heavy-2p.pdf')]);
  await expect(pageCards(page)).toHaveCount(2);
}

test('compresses the pictures for real, shows the size before saving, and the file still opens', async ({
  page,
}) => {
  const { foreignRequests, cspViolations } = watch(page);
  await loadPhotos(page);
  const dialog = await openExportDialog(page);
  await dialog.getByRole('radio', { name: /^Equilibrado/ }).check();
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();

  // The real size is on screen before anything is saved.
  await expect(dialog).toContainText(/Antes de comprimir: .* Ahora: .* \(\d+ % menos\)/);
  await expect(dialog).toContainText('Listo: 2 páginas');
  const saved = await saveResult(page);
  expect(saved.name).toBe('photos-heavy-2p.pdf');
  expect(pdfPageCount(saved.bytes)).toBe(2);
  expect(saved.bytes.byteLength).toBeLessThan(ORIGINAL_SIZE * 0.4);
  expect(foreignRequests).toEqual([]);
  expect(cspViolations).toEqual([]);
});

test('the compressed result opens again and draws both pages', async ({ page }) => {
  await loadPhotos(page);
  const dialog = await openExportDialog(page);
  await dialog.getByRole('radio', { name: /^Pantalla/ }).check();
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
  const saved = await saveResult(page);
  // Leaving with pages loaded asks for confirmation; this test means to leave.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await page
    .getByTestId('file-input')
    .setInputFiles([{ name: 'compressed.pdf', mimeType: 'application/pdf', buffer: saved.bytes }]);
  await expect(pageCards(page)).toHaveCount(2);
  await expect(pageCards(page).nth(1).locator('canvas')).toBeVisible();
});

test('says so when there is nothing to gain, and still delivers the file', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('mixed-sizes-3p.pdf')]);
  await expect(pageCards(page)).toHaveCount(3);
  const dialog = await openExportDialog(page);
  await dialog.getByRole('radio', { name: /^Equilibrado/ }).check();
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect(dialog).toContainText('No había nada que ahorrar');
  const saved = await saveResult(page);
  expect(pdfPageCount(saved.bytes)).toBe(3);
});

test('is off by default and the choice has no accessibility violations', async ({ page }) => {
  await loadPhotos(page);
  const dialog = await openExportDialog(page);
  await expect(dialog.getByRole('radio', { name: 'No comprimir' })).toBeChecked();
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(results.violations).toEqual([]);
});
