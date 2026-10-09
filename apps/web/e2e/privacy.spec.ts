import { expect, test } from '@playwright/test';
import { exportPdf, expectThumbnail, fixture, openApp, watch } from './helpers';

test('a complete flow never contacts another origin and never violates the CSP', async ({
  page,
}) => {
  const seen = watch(page);
  await openApp(page);

  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('mixed-sizes-3p.pdf'), fixture('rotated-2p.pdf')]);
  await expectThumbnail(page, 0);
  await expectThumbnail(page, 4);

  const bytes = await exportPdf(page);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

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
