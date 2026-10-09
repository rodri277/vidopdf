import { expect, test } from '@playwright/test';
import {
  clickCard,
  fixture,
  loadFive,
  openApp,
  openExportDialog,
  order,
  pageCards,
} from './helpers';

test.describe('keyboard shortcuts stay with what is on screen', () => {
  test('R and Ctrl+Z pressed inside the export dialog leave the pages behind it alone', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 0);
    const rotation = () =>
      pageCards(page).nth(0).locator('[data-rotation]').getAttribute('data-rotation');
    expect(await rotation()).toBe('0');
    const dialog = await openExportDialog(page);
    await dialog.getByRole('button', { name: 'Exportar PDF' }).focus();
    await page.keyboard.press('r');
    await page.keyboard.press('Shift+r');
    await page.keyboard.press('r');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await rotation()).toBe('0');
    await expect(page.getByRole('option', { selected: true })).toHaveCount(1);
  });

  test('Delete on a legal page does not touch the hidden workspace', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacidad' }).click();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Delete');
    await page.keyboard.press('r');
    await page.getByRole('button', { name: 'Volver a mis archivos' }).click();
    await expect(pageCards(page)).toHaveCount(5);
    expect(await order(page)).toEqual([
      'mixed-sizes-3p#1',
      'mixed-sizes-3p#2',
      'mixed-sizes-3p#3',
      'rotated-2p#1',
      'rotated-2p#2',
    ]);
  });
});

test('a file dropped outside the page area is loaded instead of replacing the app', async ({
  page,
}) => {
  await openApp(page);
  const file = fixture('single-1p.pdf');
  const prevented = await page.evaluate(
    ({ name, data }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], name, { type: 'application/pdf' }));
      const header = document.querySelector('header');
      header?.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
      const drop = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });
      header?.dispatchEvent(drop);
      return drop.defaultPrevented;
    },
    { name: file.name, data: [...file.buffer] },
  );
  expect(prevented).toBe(true);
  await expect(pageCards(page)).toHaveCount(1);
});

test('leaving with pages loaded asks first; an empty workspace leaves quietly', async ({
  page,
}) => {
  await openApp(page);
  let asked = 0;
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') asked++;
    void dialog.accept();
  });
  await page.reload();
  expect(asked).toBe(0);
  await page.getByTestId('file-input').setInputFiles([fixture('single-1p.pdf')]);
  await expect(pageCards(page)).toHaveCount(1);
  await page.getByRole('heading', { name: 'Vidopdf' }).click(); // the browser only asks after a user gesture
  await page.reload();
  expect(asked).toBe(1);
});
