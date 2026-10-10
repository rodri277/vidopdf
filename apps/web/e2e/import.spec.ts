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

test('a page of the size typed is made, however big the picture is', async ({ page }) => {
  await drop(page, pictureFile('huge.png', 'png', 3000, 2000));
  const dialog = dialogOf(page);
  await dialog.getByRole('radio', { name: 'Tamaño propio' }).check();
  await expect(dialog.getByRole('radio', { name: 'Vertical' })).toHaveCount(0); // the size is used as typed
  await dialog.getByLabel('Ancho').fill('100');
  await dialog.getByLabel('Alto').fill('150,5'); // a comma works as the decimal point
  await dialog.getByRole('radio', { name: 'Sin márgenes' }).check();
  await expect(dialog).toContainText(
    'huge.png: 3000 × 2000 px, en una página de 100 × 150.5 mm, 762 ppp',
  );
  await dialog.getByRole('button', { name: 'Añadir las páginas' }).click();
  await expect(pageCards(page)).toHaveCount(1);
  const box = mediaBox(await exportPdf(page));
  expect(box.width).toBeCloseTo(283.46, 1);
  expect(box.height).toBeCloseTo(426.62, 1); // 150.5 mm
});

test('changing the unit keeps the size of the page, and a bad size is explained and blocks adding', async ({
  page,
}) => {
  await drop(page, pictureFile('a.png', 'png'));
  const dialog = dialogOf(page);
  await dialog.getByRole('radio', { name: 'Tamaño propio' }).check();
  await expect(dialog.getByLabel('Ancho')).toHaveValue('210'); // A4 as the starting point
  await dialog.getByLabel('Unidad').selectOption('in');
  await expect(dialog.getByLabel('Ancho')).toHaveValue('8.27'); // 210 mm
  await dialog.getByLabel('Ancho').fill('300'); // 300 in is more than a PDF can hold
  await expect(dialog.getByRole('alert')).toContainText('como mucho');
  await expect(dialog.getByRole('button', { name: 'Añadir las páginas' })).toBeDisabled();
  await dialog.getByLabel('Ancho').fill('0,1');
  await expect(dialog.getByRole('alert')).toContainText('al menos');
  await dialog.getByLabel('Ancho').fill('abc');
  await expect(dialog.getByRole('alert')).toContainText('mayores que cero');
  await dialog.getByLabel('Ancho').fill('6');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Añadir las páginas' })).toBeEnabled();
});

test('before adding, each picture shows its page and the resolution it will have', async ({
  page,
}) => {
  await drop(
    page,
    pictureFile('small.png', 'png', 400, 300),
    pictureFile('big.png', 'png', 3000, 2000),
  );
  const dialog = dialogOf(page);
  await dialog.getByRole('radio', { name: 'A4' }).check();
  await dialog.getByRole('radio', { name: 'Sin márgenes' }).check();
  await expect(dialog).toContainText(
    'small.png: 400 × 300 px, en una página de 297 × 210 mm, 36 ppp',
  );
  await expect(dialog).toContainText('resolución baja');
  await expect(dialog).toContainText(
    'big.png: 3000 × 2000 px, en una página de 297 × 210 mm, 257 ppp',
  );
  await expect(dialog.getByRole('img')).toHaveAccessibleName('Así quedará «small.png»');
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
