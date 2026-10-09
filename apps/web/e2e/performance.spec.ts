import { expect, test } from '@playwright/test';
import { expectThumbnail, fixture, openApp } from './helpers';

// SPEC "Presupuestos de rendimiento": a 300-page PDF shows its first thumbnails in under 1 s.
const FIRST_THUMBNAILS_BUDGET_MS = 1000;

test('a 300-page PDF shows its first thumbnails within the budget', async ({ page }) => {
  await openApp(page);
  const started = Date.now();
  await page.getByTestId('file-input').setInputFiles([fixture('pages-300.pdf')]);
  await expectThumbnail(page, 0);
  await expectThumbnail(page, 5);
  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: 'first thumbnails', description: `${String(elapsed)} ms` });
  process.stdout.write(`first thumbnails of 300 pages: ${String(elapsed)} ms\n`);
  expect(elapsed).toBeLessThan(FIRST_THUMBNAILS_BUDGET_MS);
});
