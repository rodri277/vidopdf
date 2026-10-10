import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { exportPdf, fixture, openApp, pageCards } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function loadWithBookmarks(page: Page) {
  await openApp(page);
  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('bookmarks-3p.pdf'), fixture('single-1p.pdf')]);
  await expect(pageCards(page)).toHaveCount(4);
}

async function openBookmarks(page: Page): Promise<Locator> {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^(Documento|Document)$/ })
    .click();
  const dialog = page.getByRole('dialog', { name: /^(Documento|Document)$/ });
  await dialog.getByRole('radio', { name: /^(Marcadores|Bookmarks)$/ }).check();
  return dialog;
}

test('merging keeps the bookmarks of the files, which used to be lost', async ({ page }) => {
  await loadWithBookmarks(page);
  const bytes = (await exportPdf(page)).toString('latin1');
  expect(bytes).toContain('/Outlines');
  expect(bytes).toMatch(/\/Count\s+3/);
});

test('"no bookmarks" writes none', async ({ page }) => {
  await loadWithBookmarks(page);
  const dialog = await openBookmarks(page);
  await dialog.getByRole('radio', { name: 'Sin marcadores' }).check();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  expect((await exportPdf(page)).toString('latin1')).not.toContain('/Outlines');
});

test('imports the files’ bookmarks, edits them by hand and writes the result', async ({ page }) => {
  await loadWithBookmarks(page);
  const dialog = await openBookmarks(page);
  await dialog.getByRole('radio', { name: 'Editar a mano' }).check();
  await dialog.getByRole('button', { name: 'Importar los de los archivos' }).click();
  const titles = dialog.getByPlaceholder('Título del marcador');
  await expect(titles).toHaveCount(3);
  await titles.first().fill('Portada');
  await dialog.getByRole('button', { name: 'Añadir marcador' }).click();
  await expect(titles).toHaveCount(4);
  await dialog.getByRole('button', { name: /^Eliminar: Nuevo marcador/ }).click();
  await expect(titles).toHaveCount(3);
  await dialog.getByRole('button', { name: /^Bajar: Portada/ }).click();
  await expect(titles.nth(1)).toHaveValue('Portada');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  const bytes = (await exportPdf(page)).toString('latin1');
  expect(bytes).toContain('/Outlines');
  // "Portada" as a UTF-16 text string in hexadecimal (with its byte order mark).
  expect(bytes.toLowerCase()).toContain('feff0050006f00720074006100640061');
});

for (const language of ['Español', 'English'] as const) {
  test(`the bookmarks tab has no accessibility violations in ${language}`, async ({ page }) => {
    await loadWithBookmarks(page);
    if (language === 'English') await page.getByRole('button', { name: 'English' }).click();
    const dialog = await openBookmarks(page);
    await dialog.getByRole('radio', { name: /^(Editar a mano|Edit by hand)$/ }).check();
    await dialog.getByRole('button', { name: /^(Importar|Import)/ }).click();
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
}
