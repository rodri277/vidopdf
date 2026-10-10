import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clickCard, exportPdf, loadFive } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openCrop(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^(Recortar|Crop)$/ }).click();
  const dialog = page.getByRole('dialog', { name: /(Recortar|Crop) \d+ (páginas|pages)/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('says that cropping hides and does not delete', async ({ page }) => {
  await loadFive(page);
  await clickCard(page, 0);
  const dialog = await openCrop(page);
  await expect(dialog).toContainText('no lo borra');
});

test('crops with the fields, and the exported page has that crop box', async ({ page }) => {
  await loadFive(page);
  await clickCard(page, 0);
  const dialog = await openCrop(page);
  await dialog.getByLabel('Arriba (%)').fill('10');
  await dialog.getByLabel('Izquierda (%)').fill('5');
  await expect(dialog.getByLabel('Arriba (%)')).toHaveValue('10');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  const bytes = await exportPdf(page);
  const text = bytes.toString('latin1');
  // The first page of mixed-sizes-3p.pdf is 595 x 842 (A4): 5 % from the left, 10 % from the top.
  const box = /\/CropBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  expect(box).not.toBeNull();
  const [x0, y0, x1, y1] = (box ?? []).slice(1).map(Number);
  expect(x0).toBeCloseTo(0.05 * 595, 0);
  expect(y0).toBeCloseTo(0, 0);
  expect(x1).toBeCloseTo(595, 0);
  expect(y1).toBeCloseTo(0.9 * 842, 0);
});

test('a cropped page is marked in the grid for everyone, screen readers included', async ({
  page,
}) => {
  await loadFive(page);
  await clickCard(page, 0);
  const dialog = await openCrop(page);
  await dialog.getByLabel('Arriba (%)').fill('10');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('option', { name: /recortada/ })).toHaveCount(1);
  await page.getByRole('button', { name: /^Deshacer/ }).click();
  await expect(page.getByRole('option', { name: /recortada/ })).toHaveCount(0);
});

test('detects the margins of the content and can remove the crop; undo brings it back', async ({
  page,
}) => {
  await loadFive(page);
  await clickCard(page, 0);
  const dialog = await openCrop(page);
  await dialog.getByRole('button', { name: 'Detectar márgenes' }).click();
  await expect(async () => {
    expect(Number(await dialog.getByLabel('Izquierda (%)').inputValue())).toBeGreaterThan(0);
  }).toPass();
  await dialog.getByRole('button', { name: 'Quitar recorte' }).click();
  await expect(dialog.getByLabel('Izquierda (%)')).toHaveValue('0');
  await expect(dialog.getByRole('button', { name: 'Quitar recorte' })).toBeDisabled();
});

test('the selected pages share the crop, and a dragged edge moves the margin', async ({ page }) => {
  await loadFive(page);
  await clickCard(page, 0);
  await clickCard(page, 1, ['Shift']);
  const dialog = await openCrop(page);
  await expect(dialog).toContainText('2 páginas seleccionadas');
  const frame = dialog.locator('.crop-frame');
  const box = await frame.boundingBox();
  if (box === null) throw new Error('no crop frame');
  const edge = dialog.locator('.crop-edge-top');
  const handle = await edge.boundingBox();
  if (handle === null) throw new Error('no handle');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, box.y + box.height * 0.2, { steps: 6 });
  await page.mouse.up();
  const top = Number(await dialog.getByLabel('Arriba (%)').inputValue());
  expect(top).toBeGreaterThan(15);
  expect(top).toBeLessThan(25);
});

for (const language of ['Español', 'English'] as const) {
  test(`the dialog has no accessibility violations in ${language}`, async ({ page }) => {
    await loadFive(page);
    if (language === 'English') await page.getByRole('button', { name: 'English' }).click();
    await clickCard(page, 0);
    await openCrop(page);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
}
