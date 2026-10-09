import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  exportPdf,
  fixture,
  mediaBox,
  openApp,
  pageCards,
  pdfPageCount,
  pictureFile,
} from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function drop(page: Page, ...files: ReturnType<typeof pictureFile>[]) {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles(files);
}

const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Añadir imágenes como páginas' });

test('pictures wait for the layout choice, then become pages in the order they were dropped', async ({
  page,
}) => {
  await drop(page, pictureFile('first.png', 'png'), pictureFile('second.jpg', 'jpeg'));
  const dialog = dialogOf(page);
  await expect(dialog).toContainText('2 imágenes se convertirán, cada una, en una página de PDF.');
  await expect(pageCards(page)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Añadir las páginas' }).click();
  await expect(dialog).toBeHidden();
  await expect(pageCards(page)).toHaveCount(2);
  await expect(page.getByText('first.png')).toBeVisible();
  await expect(page.getByText('second.jpg')).toBeVisible();
  expect(pdfPageCount(await exportPdf(page))).toBe(2);
});

test('the chosen paper, orientation and margins are used', async ({ page }) => {
  await drop(page, pictureFile('wide.png', 'png', 400, 300));
  const dialog = dialogOf(page);
  await dialog.getByRole('radio', { name: 'A4' }).check();
  await dialog.getByRole('radio', { name: 'Automática' }).check();
  await dialog.getByRole('button', { name: 'Añadir las páginas' }).click();
  await expect(pageCards(page)).toHaveCount(1);
  expect(mediaBox(await exportPdf(page))).toEqual({ width: 842, height: 595 }); // wide picture: landscape A4
});

test('"Fit the image" makes the page the size of the picture plus its margins', async ({
  page,
}) => {
  await drop(page, pictureFile('wide.png', 'png', 400, 300));
  const dialog = dialogOf(page);
  await dialog.getByRole('radio', { name: 'Ajustar a la imagen' }).check();
  await dialog.getByRole('radio', { name: 'Sin márgenes' }).check();
  await dialog.getByRole('button', { name: 'Añadir las páginas' }).click();
  await expect(pageCards(page)).toHaveCount(1);
  expect(mediaBox(await exportPdf(page))).toEqual({ width: 300, height: 225 }); // 400 x 300 px at 96 dpi
});

test('a phone photo is turned upright using its EXIF orientation', async ({ page }) => {
  // Stored 400 x 200 (wide) but recorded as "rotate 90 degrees": it is really a tall photo.
  await drop(page, pictureFile('phone.jpg', 'jpeg', 400, 200, 6));
  const dialog = dialogOf(page);
  await dialog.getByRole('radio', { name: 'A4' }).check();
  await dialog.getByRole('radio', { name: 'Automática' }).check();
  await dialog.getByRole('button', { name: 'Añadir las páginas' }).click();
  await expect(pageCards(page)).toHaveCount(1);
  expect(mediaBox(await exportPdf(page))).toEqual({ width: 595, height: 842 }); // portrait, not landscape
});

test('cancelling drops the pictures and adds nothing', async ({ page }) => {
  await drop(page, pictureFile('a.png', 'png'));
  const dialog = dialogOf(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(pageCards(page)).toHaveCount(0);
});

test('Escape closes the choice like Cancel does', async ({ page }) => {
  await drop(page, pictureFile('a.png', 'png'));
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toBeHidden();
  await expect(pageCards(page)).toHaveCount(0);
});

test('a PDF dropped with a picture loads at once, the picture waits', async ({ page }) => {
  await openApp(page);
  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('single-1p.pdf'), pictureFile('a.png', 'png')]);
  await expect(dialogOf(page)).toBeVisible();
  await expect(pageCards(page)).toHaveCount(1);
  await dialogOf(page).getByRole('button', { name: 'Añadir las páginas' }).click();
  await expect(pageCards(page)).toHaveCount(2);
});

test('WebP is turned down with a clear message, and a damaged picture is reported', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([pictureFile('photo.webp', 'webp')]);
  await expect(page.getByText('photo.webp: solo se admiten imágenes JPEG y PNG.')).toBeVisible();
  await expect(dialogOf(page)).toBeHidden();

  const broken = pictureFile('broken.png', 'png');
  await page
    .getByTestId('file-input')
    .setInputFiles([{ ...broken, buffer: broken.buffer.subarray(0, 40) }]);
  await dialogOf(page).getByRole('button', { name: 'Añadir las páginas' }).click();
  await expect(page.getByText(/broken\.png: no se pudo leer/)).toBeVisible();
  await expect(pageCards(page)).toHaveCount(0);
});

test('a file that is neither a PDF nor a picture is ignored with a message', async ({ page }) => {
  await openApp(page);
  await page
    .getByTestId('file-input')
    .setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') }]);
  await expect(page.getByText(/notes\.txt no es un PDF ni una imagen JPEG o PNG/)).toBeVisible();
});

test('the picture dialog has no accessibility violations, in Spanish and English', async ({
  page,
}) => {
  await drop(page, pictureFile('a.png', 'png'));
  await expect(dialogOf(page)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByTestId('file-input').setInputFiles([pictureFile('b.png', 'png')]);
  const english = page.getByRole('dialog', { name: 'Add images as pages' });
  await expect(english).toContainText('One image will become a PDF page.');
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});
