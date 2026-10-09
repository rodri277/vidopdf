import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

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
