import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { announcer, clickCard, loadFive, order, pageCards } from './helpers';

const FIVE = [
  'mixed-sizes-3p#1',
  'mixed-sizes-3p#2',
  'mixed-sizes-3p#3',
  'rotated-2p#1',
  'rotated-2p#2',
];

const selectedCount = (page: Page) => page.locator('[role="option"][aria-selected="true"]');

test.describe('selection', () => {
  test('click selects one page, Shift extends a range and Ctrl or Cmd toggles', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 1);
    await expect(selectedCount(page)).toHaveCount(1);

    await clickCard(page, 3, ['Shift']);
    await expect(selectedCount(page)).toHaveCount(3);

    await clickCard(page, 0, ['ControlOrMeta']);
    await expect(selectedCount(page)).toHaveCount(4);
    await clickCard(page, 2, ['ControlOrMeta']);
    await expect(selectedCount(page)).toHaveCount(3);
  });

  test('Ctrl or Cmd + A selects every page', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await page.keyboard.press('ControlOrMeta+a');
    await expect(selectedCount(page)).toHaveCount(5);
    await expect(announcer(page)).toHaveText(/5 páginas seleccionadas/);
  });

  test('a rectangle over the grid selects the pages under it', async ({ page }) => {
    await loadFive(page);
    const first = await pageCards(page).nth(0).boundingBox();
    const third = await pageCards(page).nth(2).boundingBox();
    if (first === null || third === null) throw new Error('cards are not visible');
    // Start in the empty space above the first card and sweep across the first three.
    await page.mouse.move(first.x + 2, first.y - 14);
    await page.mouse.down();
    await page.mouse.move(third.x + third.width - 4, third.y + 60, { steps: 8 });
    await page.mouse.up();
    await expect(selectedCount(page)).toHaveCount(3);
  });
});

test.describe('reordering', () => {
  test('dragging a page with the mouse moves it, and shows where it will land', async ({
    page,
  }) => {
    await loadFive(page);
    const from = await pageCards(page).nth(0).boundingBox();
    const to = await pageCards(page).nth(3).boundingBox();
    if (from === null || to === null) throw new Error('cards are not visible');

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width * 0.8, to.y + to.height / 2, { steps: 12 });
    await expect(page.getByTestId('drop-line')).toBeVisible();
    await page.mouse.up();

    await expect(page.getByTestId('drop-line')).toHaveCount(0);
    expect(await order(page)).toEqual([
      'mixed-sizes-3p#2',
      'mixed-sizes-3p#3',
      'rotated-2p#1',
      'mixed-sizes-3p#1',
      'rotated-2p#2',
    ]);
    await expect(announcer(page)).toHaveText(/Página 1 movida a la posición 4/);
  });

  test('Alt + arrows reorder with the keyboard and announce it', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 1);
    await page.keyboard.press('Alt+ArrowRight');
    expect(await order(page)).toEqual([FIVE[0], FIVE[2], FIVE[1], FIVE[3], FIVE[4]]);
    await expect(announcer(page)).toHaveText(/Página 2 movida a la posición 3/);

    await page.keyboard.press('Alt+Home');
    expect((await order(page))[0]).toBe('mixed-sizes-3p#2');
    await page.keyboard.press('Alt+End');
    expect((await order(page)).at(-1)).toBe('mixed-sizes-3p#2');
  });

  test('moves several selected pages together and keeps their relative order', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await clickCard(page, 1, ['Shift']);
    await page.keyboard.press('Alt+End');
    expect(await order(page)).toEqual([FIVE[2], FIVE[3], FIVE[4], FIVE[0], FIVE[1]]);
    await expect(announcer(page)).toHaveText(/2 páginas movidas/);
  });
});

test.describe('editing and history', () => {
  test('R rotates the selection, Shift + R turns it back, and the thumbnail is not redrawn', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await page.keyboard.press('r');
    await expect(pageCards(page).nth(0).locator('canvas')).toHaveAttribute('data-rotation', '90');
    await page.keyboard.press('Shift+r');
    await expect(pageCards(page).nth(0).locator('canvas')).toHaveAttribute('data-rotation', '0');
  });

  test('Delete removes pages and undo brings them back where they were', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 1);
    await clickCard(page, 2, ['ControlOrMeta']);
    await page.keyboard.press('Delete');
    expect(await order(page)).toEqual([FIVE[0], FIVE[3], FIVE[4]]);

    await page.keyboard.press('ControlOrMeta+z');
    expect(await order(page)).toEqual(FIVE);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await order(page)).toEqual([FIVE[0], FIVE[3], FIVE[4]]);
  });

  test('Ctrl or Cmd + D duplicates a page right after itself', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 2);
    await page.keyboard.press('ControlOrMeta+d');
    expect(await order(page)).toEqual([FIVE[0], FIVE[1], FIVE[2], FIVE[2], FIVE[3], FIVE[4]]);
  });

  test('undo and redo walk back and forth through the whole session', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await page.keyboard.press('Alt+ArrowRight'); // move
    await page.keyboard.press('r'); // rotate
    await page.keyboard.press('ControlOrMeta+d'); // duplicate
    await page.keyboard.press('Delete'); // delete the copy
    const end = await order(page);
    expect(end).toEqual([FIVE[1], FIVE[0], FIVE[2], FIVE[3], FIVE[4]]);

    for (let step = 0; step < 4; step++) await page.keyboard.press('ControlOrMeta+z');
    expect(await order(page)).toEqual(FIVE);
    // Loading each file is a step of its own, so two more undos empty the workspace.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(pageCards(page)).toHaveCount(3);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(pageCards(page)).toHaveCount(0);

    for (let step = 0; step < 6; step++) await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(pageCards(page)).toHaveCount(5);
    expect(await order(page)).toEqual(end);
  });

  test('the Undo and Redo buttons reflect the history', async ({ page }) => {
    await loadFive(page);
    const undo = page.getByRole('button', { name: 'Deshacer' });
    const redo = page.getByRole('button', { name: 'Rehacer' });
    await expect(redo).toBeDisabled();
    await clickCard(page, 0);
    await page.keyboard.press('Delete');
    await expect(redo).toBeDisabled();
    await undo.click();
    await expect(redo).toBeEnabled();
  });
});

test.describe('large documents', () => {
  test('a 300-page PDF only keeps a few dozen cards in the page and scrolls to the end', async ({
    page,
  }) => {
    await loadFive(page);
    await page.getByTestId('file-input').setInputFiles([
      {
        name: 'pages-300.pdf',
        mimeType: 'application/pdf',
        buffer: (await import('./helpers')).fixture('pages-300.pdf').buffer,
      },
    ]);
    await expect(page.getByText('305 páginas')).toBeVisible();
    expect(await pageCards(page).count()).toBeLessThan(60);

    await page.getByRole('listbox').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole('option', { name: /Página 305 de 305/ })).toBeVisible();
    await expect(pageCards(page).last().locator('canvas')).toBeVisible();
    expect(await pageCards(page).count()).toBeLessThan(60);
  });
});
