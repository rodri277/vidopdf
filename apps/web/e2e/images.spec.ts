import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  JPEG_SIGNATURE,
  PNG_SIGNATURE,
  clickCard,
  loadFive,
  openExportTab,
  pngSize,
  saveResult,
  startsWith,
  unzipFiles,
} from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function imagesTab(page: Page): Promise<Locator> {
  return openExportTab(page, 'Imágenes');
}

const create = (dialog: Locator) => dialog.getByRole('button', { name: 'Crear imágenes' });

async function setDpi(dialog: Locator, dpi: number) {
  await dialog.getByLabel(/Resolución/).fill(String(dpi));
}

test.describe('PNG', () => {
  test('exports every page at the chosen resolution into a ZIP, named and in order', async ({
    page,
  }) => {
    await loadFive(page);
    const dialog = await imagesTab(page);
    await expect(dialog).toContainText('Se creará un ZIP con 5 imágenes.');
    await setDpi(dialog, 72);
    await create(dialog).click();
    await expect(dialog).toContainText('Listo: 5 imágenes en un ZIP');
    const saved = await saveResult(page);
    expect(saved.name).toBe('vidopdf-png.zip');
    const files = unzipFiles(saved.bytes);
    expect(Object.keys(files)).toEqual([
      'vidopdf-1.png',
      'vidopdf-2.png',
      'vidopdf-3.png',
      'vidopdf-4.png',
      'vidopdf-5.png',
    ]);
    expect(Object.values(files).every((bytes) => startsWith(bytes, PNG_SIGNATURE))).toBe(true);
    expect(pngSize(files['vidopdf-1.png'] ?? new Uint8Array())).toEqual({
      width: 595,
      height: 842,
    }); // A4
    expect(pngSize(files['vidopdf-2.png'] ?? new Uint8Array())).toEqual({
      width: 612,
      height: 792,
    }); // Letter
    expect(pngSize(files['vidopdf-3.png'] ?? new Uint8Array())).toEqual({
      width: 400,
      height: 300,
    });
    expect(pngSize(files['vidopdf-5.png'] ?? new Uint8Array())).toEqual({
      width: 842,
      height: 595,
    }); // turned page
  });

  test('a higher resolution makes bigger pictures', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    const dialog = await imagesTab(page);
    await dialog.getByRole('radio', { name: /Solo las seleccionadas/ }).check();
    await setDpi(dialog, 144);
    await create(dialog).click();
    const saved = await saveResult(page);
    // One page is delivered as a plain picture, not a ZIP.
    expect(saved.name).toBe('vidopdf-1.png');
    expect(pngSize(saved.bytes)).toEqual({ width: 1190, height: 1684 });
  });

  test('follows the rotation of the grid and includes blank pages as white paper', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await page.keyboard.press('r');
    await page.getByRole('button', { name: /Insertar página en blanco/ }).click();
    const dialog = await imagesTab(page);
    await setDpi(dialog, 72);
    await create(dialog).click();
    const files = unzipFiles((await saveResult(page)).bytes);
    expect(Object.keys(files)).toHaveLength(6);
    expect(pngSize(files['vidopdf-1.png'] ?? new Uint8Array())).toEqual({
      width: 842,
      height: 595,
    }); // A-1 turned
    expect(pngSize(files['vidopdf-2.png'] ?? new Uint8Array())).toEqual({
      width: 595,
      height: 842,
    }); // the blank page
  });

  test('the selection scope is off when nothing is selected', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await clickCard(page, 0, ['ControlOrMeta']);
    const dialog = await imagesTab(page);
    await expect(dialog.getByRole('radio', { name: /Solo las seleccionadas/ })).toBeDisabled();
  });
});

test.describe('JPEG and WebP', () => {
  test('JPEG has its own signature, and its quality control only works for lossy formats', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 0);
    const dialog = await imagesTab(page);
    const quality = dialog.getByLabel(/Calidad/);
    await expect(quality).toBeDisabled();
    await dialog.getByRole('radio', { name: 'JPEG' }).check();
    await expect(quality).toBeEnabled();
    await dialog.getByRole('radio', { name: /Solo las seleccionadas/ }).check();
    await setDpi(dialog, 72);
    await create(dialog).click();
    const saved = await saveResult(page);
    expect(saved.name).toBe('vidopdf-1.jpg');
    expect(startsWith(saved.bytes, JPEG_SIGNATURE)).toBe(true);
  });

  test('WebP is offered exactly when this browser can write it, and says why when it cannot', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 0);
    // Safari on macOS cannot encode WebP; Chromium and WebKit on Linux can. Ask the browser itself.
    const canWrite = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(1, 1);
      canvas.getContext('2d');
      return (await canvas.convertToBlob({ type: 'image/webp' })).type === 'image/webp';
    });
    const dialog = await imagesTab(page);
    const webp = dialog.getByRole('radio', { name: 'WebP' });
    if (canWrite) {
      await expect(webp).toBeEnabled();
      await webp.check();
      await dialog.getByRole('radio', { name: /Solo las seleccionadas/ }).check();
      await setDpi(dialog, 72);
      await create(dialog).click();
      const saved = await saveResult(page);
      expect(saved.name).toBe('vidopdf-1.webp');
      expect(Buffer.from(saved.bytes.subarray(8, 12)).toString('latin1')).toBe('WEBP');
    } else {
      await expect(webp).toBeDisabled();
      await expect(dialog).toContainText('Este navegador no puede crear imágenes WebP.');
    }
  });
});

test.describe('accessibility', () => {
  test('the images form has no violations, in Spanish and English', async ({ page }) => {
    await loadFive(page);
    const dialog = await imagesTab(page);
    await expect(dialog.getByRole('radio', { name: 'PNG (sin pérdida)' })).toBeChecked();
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('banner').getByRole('button', { name: 'Export' }).click();
    const english = page.getByRole('dialog', { name: 'Export' });
    await english.getByRole('radio', { name: 'Images' }).check();
    await expect(english).toContainText('A ZIP with 5 images will be created.');
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
});
