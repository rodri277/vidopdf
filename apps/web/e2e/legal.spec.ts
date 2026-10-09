import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadFive, openApp, pageCards, watch } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const footer = (page: Page) => page.getByRole('navigation', { name: 'Información legal' }).last();

const PAGES = [
  {
    link: 'Privacidad',
    path: '/privacy',
    title: 'Política de privacidad',
    text: 'vidotho@gmail.com',
  },
  { link: 'Aviso legal', path: '/legal', title: 'Aviso legal', text: 'alias' },
  { link: 'Términos', path: '/terms', title: 'Términos de uso', text: 'tal cual' },
  { link: 'Licencias', path: '/licenses', title: 'Licencias', text: 'pdfjs-dist' },
] as const;

test.describe('legal pages inside the app', () => {
  for (const entry of PAGES) {
    test(`${entry.link} opens from the footer, has its own address and no violations`, async ({
      page,
    }) => {
      await openApp(page);
      await footer(page).getByRole('link', { name: entry.link }).click();
      await expect(page).toHaveURL(new RegExp(`${entry.path}$`));
      await expect(page.getByRole('heading', { level: 2, name: entry.title })).toBeFocused();
      await expect(page.getByRole('main')).toContainText(entry.text);
      expect(await page.title()).toContain(entry.title);
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    });

    test(`${entry.link} can be opened directly and reloaded, in English too`, async ({ page }) => {
      await page.goto(entry.path);
      await expect(page.getByRole('heading', { level: 2, name: entry.title })).toBeVisible();
      await page.getByRole('button', { name: 'English' }).click();
      await expect(page.getByRole('main')).not.toContainText(entry.title);
      // Switching the language must not pull the focus to the title (Safari does not focus a
      // clicked button, so this checks where the focus did not go).
      await expect(page.getByRole('heading', { level: 2 })).not.toBeFocused();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
      await page.reload();
      await expect(page.getByRole('main')).toBeVisible();
    });
  }

  test('leaving for a legal page and coming back keeps the loaded files', async ({ page }) => {
    await loadFive(page);
    await footer(page).getByRole('link', { name: 'Privacidad' }).click();
    await expect(page.getByRole('main')).toContainText('no salen de tu dispositivo');
    await page.getByRole('button', { name: 'Volver a mis archivos' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(pageCards(page)).toHaveCount(5);
  });

  test('the contact address is a mail link', async ({ page }) => {
    await page.goto('/privacy');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'vidotho@gmail.com' }).first(),
    ).toHaveAttribute('href', 'mailto:vidotho@gmail.com');
  });

  test('the licenses page lists what ships, with the full texts one click away', async ({
    page,
  }) => {
    const { foreignRequests, cspViolations } = watch(page);
    await page.goto('/licenses');
    const main = page.getByRole('main');
    for (const name of ['@cantoo/pdf-lib', 'pdfjs-dist', 'react', 'CMaps (Adobe)', 'Foxit']) {
      await expect(main).toContainText(name);
    }
    await main.getByText('Mostrar los textos completos').click();
    await expect(main.locator('.license-text')).toContainText('Permission is hereby granted');
    expect(foreignRequests).toEqual([]);
    expect(cspViolations).toEqual([]);
  });

  test('every notice and the SBOM linked from the licenses page is really served', async ({
    page,
  }) => {
    await page.goto('/licenses');
    await expect(
      page.getByRole('main').getByRole('cell', { name: 'LICENSE_OPENJPEG' }),
    ).toBeVisible();
    const hrefs = await page
      .getByRole('main')
      .locator('a[href^="/pdfjs/"], a[href="/sbom.cdx.json"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThanOrEqual(8);
    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.ok(), href).toBe(true);
      expect((await response.text()).length, href).toBeGreaterThan(50);
    }
  });
});
