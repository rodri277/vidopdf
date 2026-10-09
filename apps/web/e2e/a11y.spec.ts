import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectThumbnail, fixture, openApp } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('the empty state has no accessibility violations, in both languages', async ({ page }) => {
  await openApp(page);
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Drop your PDFs here' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

test('the workspace with files and an error has no accessibility violations', async ({ page }) => {
  await openApp(page);
  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('mixed-sizes-3p.pdf'), fixture('truncated.pdf')]);
  await expectThumbnail(page, 0);
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});
