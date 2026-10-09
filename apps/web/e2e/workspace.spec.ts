import { expect, test } from '@playwright/test';
import { exportPdf, expectThumbnail, fixture, openApp, pageCards } from './helpers';

test('merges the pages of several files into one valid PDF', async ({ page }) => {
  await openApp(page);
  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('mixed-sizes-3p.pdf'), fixture('rotated-2p.pdf')]);
  await expect(pageCards(page)).toHaveCount(5);
  await expect(page.getByText('3 páginas')).toBeVisible();
  await expect(page.getByText('2 páginas')).toBeVisible();

  const bytes = await exportPdf(page);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(bytes.toString('latin1')).toMatch(/\/Count 5\b/);
});

test.describe('hostile input', () => {
  const cases = [
    ['zero-bytes.pdf', /vacío/],
    ['not-a-pdf.pdf', /dañado o no es un PDF/],
    ['truncated.pdf', /dañado o no es un PDF/],
    ['encrypted-owner-restricted.pdf', /protegido/],
    ['encrypted-user-password.pdf', /protegido/],
  ] as const;

  for (const [name, message] of cases) {
    test(`${name} shows a clear error and the app keeps working`, async ({ page }) => {
      await openApp(page);
      await page.getByTestId('file-input').setInputFiles([fixture(name)]);
      await expect(page.getByText(message)).toBeVisible();

      await page.getByTestId('file-input').setInputFiles([fixture('single-1p.pdf')]);
      await expectThumbnail(page, 0);
    });
  }

  test('a bad file does not stop the good ones loaded with it', async ({ page }) => {
    await openApp(page);
    await page
      .getByTestId('file-input')
      .setInputFiles([fixture('truncated.pdf'), fixture('single-1p.pdf')]);
    await expect(page.getByText(/dañado o no es un PDF/)).toBeVisible();
    await expectThumbnail(page, 0);
  });
});

test('Spanish is the default and the language choice survives a reload', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByText('Tus archivos no salen de este dispositivo.').first()).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText('Your files never leave this device.').first()).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
});
