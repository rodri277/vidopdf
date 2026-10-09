import { expect, test } from '@playwright/test';
import { fixture, openApp, watch } from './helpers';

test('a complete flow never contacts another origin and never violates the CSP', async ({
  page,
}) => {
  const seen = watch(page);
  await openApp(page);

  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('mixed-sizes-3p.pdf'), fixture('rotated-2p.pdf')]);
  await expect(page.getByRole('img', { name: /Primera página de mixed-sizes-3p/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Primera página de rotated-2p/ })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('vidopdf-merged.pdf');

  expect(seen.foreignRequests).toEqual([]);
  expect(seen.cspViolations).toEqual([]);
});

test('the response carries the strict security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).not.toMatch(/https?:\/\//);
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['x-content-type-options']).toBe('nosniff');
});
