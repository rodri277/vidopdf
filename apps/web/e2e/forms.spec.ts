import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { exportPdf, fixture, openApp, pageCards } from './helpers';

/** How a PDF stores a text string: UTF-16 with a byte order mark, in hexadecimal. */
const hexOf = (text: string) => {
  let hex = 'feff';
  for (const char of text) hex += (char.codePointAt(0) ?? 0).toString(16).padStart(4, '0');
  return hex;
};

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function loadForm(page: Page, copies = 1) {
  await openApp(page);
  const files = Array.from({ length: copies }, (_, index) => ({
    ...fixture('form-1p.pdf'),
    name: `form-${String(index + 1)}.pdf`,
  }));
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(pageCards(page)).toHaveCount(copies);
}

async function openForms(page: Page): Promise<Locator> {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^(Documento|Document)$/ })
    .click();
  const dialog = page.getByRole('dialog', { name: /^(Documento|Document)$/ });
  await dialog.getByRole('radio', { name: /^(Formularios|Forms)$/ }).check();
  return dialog;
}

test('lists the fields of each file with what they hold', async ({ page }) => {
  await loadForm(page);
  const dialog = await openForms(page);
  await expect(dialog.getByLabel('full_name')).toHaveValue('Ada Lovelace');
  await expect(dialog.getByRole('checkbox', { name: 'accept' })).toBeVisible();
});

test('says there is no form in a file without one', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('single-1p.pdf')]);
  await expect(pageCards(page)).toHaveCount(1);
  const dialog = await openForms(page);
  await expect(dialog).toContainText('Ninguno de los archivos cargados tiene formulario');
});

test('what is typed reaches the exported file, which stays fillable', async ({ page }) => {
  await loadForm(page);
  const dialog = await openForms(page);
  await dialog.getByLabel('full_name').fill('Grace Hopper');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  const bytes = (await exportPdf(page)).toString('latin1');
  expect(bytes).toContain('/AcroForm');
  expect(bytes.toLowerCase()).toContain(hexOf('Grace Hopper'));
});

test('flattened, the value is part of the page and there is no form left', async ({ page }) => {
  await loadForm(page);
  const dialog = await openForms(page);
  await dialog.getByLabel('full_name').fill('Grace Hopper');
  await dialog.getByRole('checkbox', { name: /Aplanar al exportar/ }).check();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  const bytes = (await exportPdf(page)).toString('latin1');
  expect(bytes).not.toContain('/AcroForm');
});

test('two files with the same field are filled apart', async ({ page }) => {
  await loadForm(page, 2);
  const dialog = await openForms(page);
  const names = dialog.getByLabel('full_name');
  await expect(names).toHaveCount(2);
  await names.nth(0).fill('First Person');
  await names.nth(1).fill('Second Person');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  const bytes = (await exportPdf(page)).toString('latin1');
  expect(bytes.toLowerCase()).toContain(hexOf('First Person'));
  expect(bytes.toLowerCase()).toContain(hexOf('Second Person'));
  expect(bytes.toLowerCase()).toContain(hexOf('full_name_2'));
});

test('a value the form font cannot hold stops the export and says which characters', async ({
  page,
}) => {
  await loadForm(page);
  const dialog = await openForms(page);
  await dialog.getByLabel('full_name').fill('Привет');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Exportar$/ })
    .click();
  const exporting = page.getByRole('dialog', { name: 'Exportar' });
  await exporting.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect(exporting.getByRole('alert')).toContainText('Un texto o una imagen que has añadido');
  await expect(exporting).toContainText('П');
});

for (const language of ['Español', 'English'] as const) {
  test(`the forms tab has no accessibility violations in ${language}`, async ({ page }) => {
    await loadForm(page);
    if (language === 'English') await page.getByRole('button', { name: 'English' }).click();
    await openForms(page);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
}
