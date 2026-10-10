import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clickCard, exportPdf, loadFive, pictureFile } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openSign(page: Page): Promise<Locator> {
  await clickCard(page, 0);
  await page.getByRole('button', { name: /^(Firmar|Sign)$/ }).click();
  const dialog = page.getByRole('dialog', { name: /^(Firma visual|Visual signature)$/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('says it is a visual signature, not an electronic one', async ({ page }) => {
  await loadFive(page);
  const dialog = await openSign(page);
  await expect(dialog).toContainText('firma visual');
  await expect(dialog).toContainText('No es una firma electrónica avanzada ni cualificada');
});

test('draws a signature, puts it on the page, moves it with the keyboard and exports it', async ({
  page,
}) => {
  await loadFive(page);
  const dialog = await openSign(page);
  const pad = dialog.locator('canvas.signature-pad');
  const box = await pad.boundingBox();
  if (box === null) throw new Error('no pad');
  await page.mouse.move(box.x + 40, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40, { steps: 6 });
  await page.mouse.move(box.x + 200, box.y + 110, { steps: 6 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Usar esta firma' }).click();
  await expect(dialog.getByText('Firma lista para colocar')).toBeVisible();
  await dialog.getByRole('button', { name: 'Poner la firma en esta página' }).click();
  const signature = dialog.locator('.sign-item');
  await expect(signature).toBeVisible();
  const before = await signature.boundingBox();
  await signature.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  const after = await signature.boundingBox();
  expect(after?.x).toBeLessThan(before?.x ?? 0);
  expect(after?.y).toBeLessThan(before?.y ?? 0);
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('option', { name: /firmada/ })).toHaveCount(1);
  expect((await exportPdf(page)).toString('latin1')).toMatch(/\/Subtype\s*\/Image/);
});

test('the signature shows on the page in the grid and in the preview, where it will land', async ({
  page,
}) => {
  await loadFive(page);
  const dialog = await openSign(page);
  await dialog.getByRole('radio', { name: 'Escribirla' }).check();
  await dialog.getByLabel('Tu nombre').fill('Ana Pérez');
  await dialog.getByRole('button', { name: 'Usar esta firma' }).click();
  await dialog.getByRole('button', { name: 'Poner la firma en esta página' }).click();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();

  // In the grid: a picture over the first page, at the place it was put (55 % across, 80 % down).
  const card = page.getByRole('option').first();
  const mark = card.locator('.overlay-picture');
  await expect(mark).toHaveCount(1);
  await expect(mark).toBeVisible();
  expect(await mark.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const [frame, box] = await Promise.all([
    card.locator('.page-frame').boundingBox(),
    mark.boundingBox(),
  ]);
  if (frame === null || box === null) throw new Error('no boxes');
  expect((box.x - frame.x) / frame.width).toBeCloseTo(0.55, 1);
  expect((box.y - frame.y) / frame.height).toBeCloseTo(0.8, 1);
  expect(box.width / frame.width).toBeCloseTo(0.3, 1);
  // The other pages have none.
  await expect(page.locator('.overlay-picture')).toHaveCount(1);

  // In the preview.
  await card.dblclick();
  const preview = page.getByRole('dialog', { name: /Vista previa de la página 1 de 5/ });
  await expect(preview.locator('.overlay-picture')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Deshacer/ }).click();
  await expect(page.locator('.overlay-picture')).toHaveCount(0);
});

test('a typed signature and one from a picture both become something placeable', async ({
  page,
}) => {
  await loadFive(page);
  const dialog = await openSign(page);
  await dialog.getByRole('radio', { name: 'Escribirla' }).check();
  await dialog.getByLabel('Tu nombre').fill('Ana Pérez');
  await dialog.getByRole('button', { name: 'Usar esta firma' }).click();
  await expect(dialog.getByText('Firma lista para colocar')).toBeVisible();
  await dialog.getByRole('radio', { name: 'Usar una imagen' }).check();
  await dialog
    .getByTestId('signature-input')
    .setInputFiles(pictureFile('firma.png', 'png', 300, 100));
  await dialog.getByRole('button', { name: 'Poner la firma en esta página' }).click();
  await expect(dialog.locator('.sign-item')).toBeVisible();
  await dialog.getByRole('button', { name: 'Quitar de esta página' }).click();
  await expect(dialog.locator('.sign-item')).toHaveCount(0);
});

test('nothing is drawn yet: it says so instead of making an empty signature', async ({ page }) => {
  await loadFive(page);
  const dialog = await openSign(page);
  await dialog.getByRole('button', { name: 'Usar esta firma' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No hay nada que usar todavía');
});

for (const language of ['Español', 'English'] as const) {
  test(`the dialog has no accessibility violations in ${language}`, async ({ page }) => {
    await loadFive(page);
    if (language === 'English') await page.getByRole('button', { name: 'English' }).click();
    await openSign(page);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
}
