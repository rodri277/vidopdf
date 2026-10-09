import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/generated');

export function fixture(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: 'application/pdf', buffer: readFileSync(join(fixtures, name)) };
}

/** Records everything that could leave the page or break the security policy. */
export function watch(page: Page) {
  const foreignRequests: string[] = [];
  const cspViolations: string[] = [];
  const origin = new URL(process.env.BASE_URL ?? 'http://localhost:4173').origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    const local = ['data:', 'blob:'].includes(url.protocol) || url.origin === origin;
    if (!local) foreignRequests.push(request.url());
  });
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text()))
      cspViolations.push(message.text());
  });
  return { foreignRequests, cspViolations };
}

export async function openApp(page: Page): Promise<void> {
  // The native save dialog cannot be driven by Playwright; the app falls back to a normal download.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showSaveFilePicker');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Vidopdf' })).toBeVisible();
}

/** The grid cards, in document order. */
export function pageCards(page: Page): Locator {
  return page.getByRole('option');
}

/** Waits until the card at `index` has a drawn thumbnail (its canvas exists). */
export async function expectThumbnail(page: Page, index: number): Promise<void> {
  await expect(pageCards(page).nth(index).locator('canvas')).toBeVisible();
}

/** Exports and returns the downloaded bytes. */
export async function exportPdf(page: Page): Promise<Buffer> {
  await page
    .getByRole('button', { name: /Exportar|Export$/ })
    .first()
    .click();
  const save = page.getByRole('button', { name: /^(Guardar PDF|Save PDF)$/ });
  await expect(save).toBeVisible();
  const download = page.waitForEvent('download');
  await save.click();
  const path = await (await download).path();
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

/** The pages in document order, as `file#pageNumber` (or `blank`). */
export async function order(page: Page): Promise<string[]> {
  const origins = await pageCards(page).evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-origin') ?? '?'),
  );
  return origins.map((origin) => origin.replace('.pdf', ''));
}

export async function loadFive(page: Page): Promise<void> {
  await openApp(page);
  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('mixed-sizes-3p.pdf'), fixture('rotated-2p.pdf')]);
  await expect(pageCards(page)).toHaveCount(5);
  await expectThumbnail(page, 4);
}

export const announcer = (page: Page): Locator => page.getByTestId('announcer');

/** Clicks the card at `index` without changing how the grid is scrolled. */
export async function clickCard(
  page: Page,
  index: number,
  modifiers: ('Shift' | 'ControlOrMeta')[] = [],
): Promise<void> {
  await pageCards(page).nth(index).click({ modifiers });
}
