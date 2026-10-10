import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loadFive, openExportDialog, pictureFile, saveResult } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openDocument(page: Page): Promise<Locator> {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^(Documento|Document)$/ })
    .click();
  const dialog = page.getByRole('dialog', { name: /^(Documento|Document)$/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

const stampText = (dialog: Locator) => dialog.locator('.stamp-text');

test('page numbers show in the preview at once, and undo takes them back', async ({ page }) => {
  await loadFive(page);
  const dialog = await openDocument(page);
  await dialog.getByRole('checkbox', { name: 'Activar' }).first().check();
  await expect(stampText(dialog)).toHaveText('1 / 5');
  await dialog.getByLabel('Formato').selectOption('roman');
  await expect(stampText(dialog)).toHaveText('i');
  await dialog.getByLabel('Página de la vista previa').fill('3');
  await expect(stampText(dialog)).toHaveText('iii');
  // Undoing the format brings back "n / total" on the page being previewed (the third).
  await dialog.getByRole('button', { name: 'Deshacer' }).click();
  await expect(stampText(dialog)).toHaveText('3 / 5');
  await dialog.getByRole('button', { name: 'Deshacer' }).click();
  await expect(stampText(dialog)).toHaveCount(0);
});

test('the preview follows the options: skip the cover, only odd pages, a bad range is explained', async ({
  page,
}) => {
  await loadFive(page);
  const dialog = await openDocument(page);
  await dialog.getByRole('checkbox', { name: 'Activar' }).first().check();
  await dialog
    .getByRole('checkbox', { name: /No ponerlo en la primera página/ })
    .first()
    .check();
  await expect(stampText(dialog)).toHaveCount(0); // preview shows page 1, the cover
  await dialog.getByLabel('Página de la vista previa').fill('2');
  await expect(stampText(dialog)).toHaveText('2 / 5');
  await dialog.getByLabel('En qué páginas').first().selectOption('odd');
  await expect(stampText(dialog)).toHaveCount(0);
  await dialog.getByLabel('En qué páginas').first().selectOption('ranges');
  await dialog.getByLabel('Rangos de páginas').fill('abc');
  await expect(dialog.getByRole('alert')).toContainText('No entiendo ese rango');
});

test('a watermark of text and one of a picture are drawn over the page', async ({ page }) => {
  await loadFive(page);
  const dialog = await openDocument(page);
  await dialog.getByRole('radio', { name: 'Marca de agua' }).check();
  await dialog.getByRole('radio', { name: 'Texto', exact: true }).check();
  await expect(stampText(dialog)).toHaveText('BORRADOR');
  await dialog.getByRole('radio', { name: 'Imagen', exact: true }).check();
  await dialog
    .getByTestId('watermark-input')
    .setInputFiles(pictureFile('logo.png', 'png', 200, 100));
  await expect(dialog.locator('img.stamp-image')).toBeVisible();
  await dialog.getByTestId('watermark-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a picture'),
  });
  await expect(dialog.getByRole('alert')).toContainText('Solo se admiten imágenes PNG y JPEG');
});

test('the exported file has the stamps, the title and no producer', async ({ page }) => {
  await loadFive(page);
  const dialog = await openDocument(page);
  await dialog.getByRole('checkbox', { name: 'Activar' }).first().check();
  await dialog.getByRole('radio', { name: 'Información' }).check();
  await dialog.getByLabel('Título').fill('Informe');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  const exporting = await openExportDialog(page);
  await exporting.getByRole('button', { name: 'Exportar PDF' }).click();
  const saved = await saveResult(page);
  const text = saved.bytes.toString('latin1');
  expect(text).toContain('/FontFile2');
  expect(text).toContain('/Title');
  expect(text).not.toContain('/Producer');
});

test('a character the fonts do not have is reported by name instead of drawn as a box', async ({
  page,
}) => {
  await loadFive(page);
  const dialog = await openDocument(page);
  await dialog.getByRole('checkbox', { name: 'Activar' }).first().check();
  await dialog.getByLabel('Texto', { exact: true }).fill('Hola 你好');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  const exporting = await openExportDialog(page);
  await exporting.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect(exporting.getByRole('alert')).toBeVisible();
  await expect(exporting).toContainText('你');
});

for (const language of ['Español', 'English'] as const) {
  test(`every tab has no accessibility violations in ${language}`, async ({ page }) => {
    await loadFive(page);
    if (language === 'English') await page.getByRole('button', { name: 'English' }).click();
    const dialog = await openDocument(page);
    for (const tab of language === 'English'
      ? ['Numbering and text', 'Watermark', 'Information']
      : ['Numeración y textos', 'Marca de agua', 'Información']) {
      await dialog.getByRole('radio', { name: tab }).check();
      if (tab.startsWith('Numer')) await dialog.getByRole('checkbox').first().check();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    }
  });
}
