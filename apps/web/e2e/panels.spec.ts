import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clickCard, loadFive, order, pageCards } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('context panel', () => {
  test('shows the export summary with nothing selected and the page actions with a selection', async ({
    page,
  }) => {
    await loadFive(page);
    const panel = page.getByRole('complementary', { name: /Exportar|seleccionada/ });
    // The pages of the file just added are selected, which is what the panel shows first.
    await expect(panel).toContainText('2 páginas seleccionadas');

    await clickCard(page, 0);
    await clickCard(page, 0, ['ControlOrMeta']);
    await expect(panel).toContainText('Se exportará un PDF de 5 páginas');
    await expect(panel.getByRole('button', { name: 'Exportar' })).toBeEnabled();

    await clickCard(page, 1);
    await clickCard(page, 3, ['Shift']);
    await expect(panel).toContainText('3 páginas seleccionadas');
  });

  test('its buttons rotate, duplicate, delete and insert a blank page', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await page.getByRole('button', { name: /Girar a la derecha/ }).click();
    await expect(pageCards(page).nth(0).locator('canvas')).toHaveAttribute('data-rotation', '90');

    await page.getByRole('button', { name: /Duplicar/ }).click();
    await expect(pageCards(page)).toHaveCount(6);

    await page.getByRole('button', { name: /Insertar página en blanco/ }).click();
    await expect(pageCards(page)).toHaveCount(7);
    expect((await order(page))[2]).toBe('blank');

    await page.getByRole('button', { name: /Eliminar/ }).click();
    await expect(pageCards(page)).toHaveCount(6);
  });
});

test.describe('preview', () => {
  test('Space opens a large preview, arrows walk through pages and Escape returns to the grid', async ({
    page,
  }) => {
    await loadFive(page);
    await clickCard(page, 1);
    await page.keyboard.press(' ');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Vista previa de la página 2 de 5');
    await expect(dialog.getByRole('img').first()).toBeVisible();
    await expect(dialog.locator('canvas')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(dialog).toContainText('página 3 de 5');
    await page.keyboard.press('End');
    await expect(dialog).toContainText('página 5 de 5');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('listbox')).toBeFocused();
  });

  test('double click opens the preview of that page, and it has no accessibility violations', async ({
    page,
  }) => {
    await loadFive(page);
    await pageCards(page).nth(2).dblclick();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('página 3 de 5');
    await expect(dialog.locator('canvas')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
});

test.describe('export dialog', () => {
  test('shows progress, then the size, and saves only when asked', async ({ page }) => {
    await loadFive(page);
    await clickCard(page, 0);
    await page.keyboard.press('Alt+End');

    await page.getByRole('button', { name: 'Exportar' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Exportar PDF' });
    await expect(dialog).toContainText(/Listo: 5 páginas, .* KB/);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Guardar PDF' }).click();
    expect((await download).suggestedFilename()).toBe('vidopdf.pdf');
    await expect(dialog).toBeHidden();
  });

  test('can be dismissed without saving anything', async ({ page }) => {
    await loadFive(page);
    await page.keyboard.press('ControlOrMeta+e');
    const dialog = page.getByRole('dialog', { name: 'Exportar PDF' });
    await expect(dialog).toContainText('Listo');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(pageCards(page)).toHaveCount(5);
  });
});

test('the whole workspace has no accessibility violations in English either', async ({ page }) => {
  await loadFive(page);
  await clickCard(page, 0);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: /Rotate right/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});
