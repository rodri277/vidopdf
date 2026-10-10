import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  clickCard,
  fixture,
  loadFive,
  openApp,
  openExportTab,
  pageCards,
  pdfPageCount,
  saveResult,
  unzipFiles,
} from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function splitTab(page: Page, kind: string | RegExp): Promise<Locator> {
  const dialog = await openExportTab(page, 'Dividir');
  await dialog.getByRole('radio', { name: kind }).check();
  return dialog;
}

const run = (dialog: Locator) => dialog.getByRole('button', { name: 'Dividir y preparar el ZIP' });

test.describe('every N pages', () => {
  test('previews the files, then delivers a ZIP of valid PDFs with the right pages', async ({
    page,
  }) => {
    await loadFive(page);
    const dialog = await splitTab(page, 'Cada N páginas');
    await dialog.getByLabel('Páginas por archivo').fill('2');
    await expect(dialog.getByRole('heading', { name: 'Se crearán 3 archivos' })).toBeVisible();
    await expect(dialog).toContainText('vidopdf_1.pdf: 2 páginas');
    await expect(dialog).toContainText('vidopdf_3.pdf: una página');

    await run(dialog).click();
    await expect(dialog).toContainText('Listo: 3 archivos, 5 páginas');
    const saved = await saveResult(page);
    expect(saved.name).toBe('vidopdf_split.zip');
    const files = unzipFiles(saved.bytes);
    expect(Object.keys(files)).toEqual(['vidopdf_1.pdf', 'vidopdf_2.pdf', 'vidopdf_3.pdf']);
    expect(Object.values(files).map(pdfPageCount)).toEqual([2, 2, 1]);
  });

  test('says what is wrong with a number that makes no sense and keeps the button off', async ({
    page,
  }) => {
    await loadFive(page);
    const dialog = await splitTab(page, 'Cada N páginas');
    await dialog.getByLabel('Páginas por archivo').fill('0');
    await expect(dialog.getByRole('alert')).toContainText('número entero de páginas');
    await expect(run(dialog)).toBeDisabled();
  });

  test('follows the order and the rotation of the grid, not the order of loading', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 0); // A-1, the first page of the first file
    await page.keyboard.press('Alt+End');
    await page.keyboard.press('r');
    const dialog = await splitTab(page, 'Cada N páginas');
    await dialog.getByLabel('Páginas por archivo').fill('1');
    await run(dialog).click();
    const files = unzipFiles((await saveResult(page)).bytes);
    const text = (name: string) => Buffer.from(files[name] ?? new Uint8Array()).toString('latin1');
    // Order now: A-2 (Letter), A-3 (small), B-1, B-2 (turned in its file), A-1 moved to the end and turned.
    expect(text('vidopdf_1.pdf')).toMatch(/MediaBox \[ 0 0 612 792 \]/);
    expect(text('vidopdf_2.pdf')).toMatch(/MediaBox \[ 0 0 400 300 \]/);
    expect(text('vidopdf_3.pdf')).toContain('/Rotate 0');
    expect(text('vidopdf_5.pdf')).toContain('/Rotate 90');
  });
});

test.describe('by ranges', () => {
  test('lists a file per range and one for the rest, and the rest can be left out', async ({
    page,
  }) => {
    await loadFive(page);
    const dialog = await splitTab(page, 'Por rangos');
    await dialog.getByLabel('Rangos de páginas').fill('1-2, 5');
    await expect(dialog.getByRole('heading', { name: 'Se crearán 3 archivos' })).toBeVisible();
    await expect(dialog).toContainText('vidopdf_p1-2.pdf: 2 páginas');
    await expect(dialog).toContainText('vidopdf_rest.pdf: 2 páginas');

    await dialog
      .getByRole('checkbox', { name: /Reunir las páginas que no estén en ningún rango/ })
      .uncheck();
    await expect(dialog.getByRole('heading', { name: 'Se crearán 2 archivos' })).toBeVisible();
    await expect(dialog).toContainText('Páginas que no están en ningún rango: 3-4');

    await run(dialog).click();
    const files = unzipFiles((await saveResult(page)).bytes);
    expect(Object.keys(files)).toEqual(['vidopdf_p1-2.pdf', 'vidopdf_p5.pdf']);
    expect(Object.values(files).map(pdfPageCount)).toEqual([2, 1]);
  });

  test('explains typing mistakes, quoting them, and is quiet while nothing is typed', async ({
    page,
  }) => {
    await loadFive(page);
    const dialog = await splitTab(page, 'Por rangos');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(run(dialog)).toBeDisabled();
    await dialog.getByLabel('Rangos de páginas').fill('1-99');
    await expect(dialog.getByRole('alert')).toContainText(
      '«1-99»: el documento solo tiene 5 páginas.',
    );
    await dialog.getByLabel('Rangos de páginas').fill('abc');
    await expect(dialog.getByRole('alert')).toContainText('No entiendo «abc»');
    await dialog.getByLabel('Rangos de páginas').fill('4-2');
    await expect(dialog.getByRole('alert')).toContainText('el final es menor que el principio');
    await expect(run(dialog)).toBeDisabled();
  });

  test('warns when a page is in two ranges', async ({ page }) => {
    await loadFive(page);
    const dialog = await splitTab(page, 'Por rangos');
    await dialog.getByLabel('Rangos de páginas').fill('1-3, 3-4');
    await expect(dialog).toContainText('Páginas que están en más de un rango: 3.');
    await run(dialog).click();
    const files = unzipFiles((await saveResult(page)).bytes);
    expect(Object.values(files).map(pdfPageCount)).toEqual([3, 2, 1]);
  });
});

test.describe('by bookmarks', () => {
  async function loadBookmarked(page: Page) {
    await openApp(page);
    await page.getByTestId('file-input').setInputFiles([fixture('bookmarks-nested-6p.pdf')]);
    await expect(pageCards(page)).toHaveCount(6);
  }

  test('cuts at the top-level bookmarks and names each file after its bookmark', async ({
    page,
  }) => {
    await loadBookmarked(page);
    const dialog = await splitTab(page, 'Por marcadores');
    await expect(dialog).toContainText('3 marcadores abren archivos nuevos');
    await expect(dialog).toContainText('bookmarks-nested-6p - Part A.pdf: 3 páginas');
    await expect(dialog).toContainText('bookmarks-nested-6p - Part B.pdf: 2 páginas');
    await run(dialog).click();
    const files = unzipFiles((await saveResult(page)).bytes);
    expect(Object.keys(files)).toEqual([
      'bookmarks-nested-6p - Part A.pdf',
      'bookmarks-nested-6p - Part B.pdf',
      'bookmarks-nested-6p - Part C.pdf',
    ]);
    expect(Object.values(files).map(pdfPageCount)).toEqual([3, 2, 1]);
  });

  test('offers the second level when the document has one', async ({ page }) => {
    await loadBookmarked(page);
    const dialog = await splitTab(page, 'Por marcadores');
    await dialog.getByLabel('Nivel de marcadores').selectOption('2');
    await expect(dialog).toContainText('6 marcadores abren archivos nuevos');
    await expect(dialog.getByRole('heading', { name: 'Se crearán 6 archivos' })).toBeVisible();
  });

  test('says so when no loaded file has bookmarks', async ({ page }) => {
    await loadFive(page);
    const dialog = await splitTab(page, 'Por marcadores');
    await expect(dialog).toContainText('Ninguno de los archivos cargados tiene marcadores');
  });
});

test.describe('by maximum size', () => {
  async function setLimit(dialog: Locator, value: string, unit: 'KB' | 'MB') {
    await dialog.getByLabel('Tamaño máximo por archivo').fill(value);
    await dialog.getByLabel('Unidad').selectOption(unit);
  }

  test('measures the real files, shows their sizes, and every file respects the limit', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByTestId('file-input').setInputFiles([fixture('pages-300.pdf')]);
    await expect(pageCards(page).first()).toBeVisible();
    const dialog = await splitTab(page, 'Por tamaño máximo');
    await expect(run(dialog)).toBeDisabled();
    await expect(dialog).toContainText('Calcula el reparto para poder continuar');
    await setLimit(dialog, '40', 'KB');
    await dialog.getByRole('button', { name: 'Calcular el reparto' }).click();
    await expect(dialog.getByRole('heading', { name: /Se crearán \d+ archivos/ })).toBeVisible();
    await expect(run(dialog)).toBeEnabled();

    await run(dialog).click();
    const saved = await saveResult(page);
    const files = Object.values(unzipFiles(saved.bytes));
    expect(files.length).toBeGreaterThan(2);
    expect(files.every((bytes) => bytes.byteLength <= 40 * 1024)).toBe(true);
    expect(files.reduce((total, bytes) => total + pdfPageCount(bytes), 0)).toBe(300);
  });

  test('changing the limit makes the old measurement stale', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('file-input').setInputFiles([fixture('pages-300.pdf')]);
    const dialog = await splitTab(page, 'Por tamaño máximo');
    await setLimit(dialog, '60', 'KB');
    await dialog.getByRole('button', { name: 'Calcular el reparto' }).click();
    await expect(run(dialog)).toBeEnabled();
    await dialog.getByLabel('Tamaño máximo por archivo').fill('50');
    await expect(run(dialog)).toBeDisabled();
    await expect(dialog).toContainText('Calcula el reparto para poder continuar');
  });

  test('names the page that is too big on its own', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('file-input').setInputFiles([fixture('scanned-2p.pdf')]);
    await expect(pageCards(page).first()).toBeVisible();
    const dialog = await splitTab(page, 'Por tamaño máximo');
    await setLimit(dialog, '20', 'KB');
    await dialog.getByRole('button', { name: 'Calcular el reparto' }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      /La página 1 ocupa .* ella sola y no cabe en el límite de 20 KB/,
    );
    await expect(run(dialog)).toBeDisabled();
  });
});

test.describe('extract and split here', () => {
  test('Extract exports only the selected pages, in document order', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 3);
    await clickCard(page, 1, ['ControlOrMeta']);
    await page.getByRole('button', { name: /Extraer a un PDF/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Exportar' });
    await expect(dialog).toContainText('Listo: 2 páginas');
    const saved = await saveResult(page);
    expect(saved.name).toBe('vidopdf_extract.pdf');
    expect(pdfPageCount(saved.bytes)).toBe(2);
  });

  test('Split here opens the split dialog with two ranges ready, cutting after the selected page', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 1);
    await page.getByRole('button', { name: /Dividir aquí/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Exportar' });
    await expect(dialog.getByLabel('Rangos de páginas')).toHaveValue('1-2, 3-5');
    await expect(dialog.getByRole('heading', { name: 'Se crearán 2 archivos' })).toBeVisible();
    await run(dialog).click();
    const files = unzipFiles((await saveResult(page)).bytes);
    expect(Object.values(files).map(pdfPageCount)).toEqual([2, 3]);
  });

  test('Split here is off when the selected page is the last one', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 4);
    await expect(page.getByRole('button', { name: /Dividir aquí/ })).toBeDisabled();
  });
});

test.describe('accessibility', () => {
  for (const kind of ['Cada N páginas', 'Por rangos', 'Por marcadores', 'Por tamaño máximo']) {
    test(`the "${kind}" form has no violations, in Spanish and English`, async ({ page }) => {
      await loadFive(page);
      const dialog = await splitTab(page, kind);
      if (kind === 'Por rangos') await dialog.getByLabel('Rangos de páginas').fill('1-2');
      await expect(dialog.getByRole('radio', { name: kind })).toBeChecked();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'English' }).click();
      await page.getByRole('banner').getByRole('button', { name: 'Export' }).click();
      await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    });
  }
});
