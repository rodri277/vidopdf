import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fixture, openApp, openExportDialog, pageCards, saveResult } from './helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** What qpdf, a separate program, says about the saved file. */
function qpdf(bytes: Uint8Array, args: string[]): string {
  const file = join(mkdtempSync(join(tmpdir(), 'vidopdf-pw-')), 'x.pdf');
  writeFileSync(file, bytes);
  try {
    return execFileSync('qpdf', [...args, file], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return (failure.stdout ?? '') + (failure.stderr ?? '');
  }
}

async function addLocked(page: Page): Promise<Locator> {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('encrypted-user-password.pdf')]);
  const dialog = page.getByRole('dialog', {
    name: /protegido con contraseña|protected with a password/,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('asks for the password of a protected file, says when it is wrong, and opens it with the right one', async ({
  page,
}) => {
  const dialog = await addLocked(page);
  await expect(dialog).toContainText('encrypted-user-password.pdf');
  await dialog.getByLabel('Contraseña').fill('not-it');
  await dialog.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('no es la correcta');
  await dialog.getByLabel('Contraseña').fill('fixture-user');
  await dialog.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(pageCards(page)).toHaveCount(1);
});

test('"do not open it" turns the file down with a plain message and nothing is loaded', async ({
  page,
}) => {
  const dialog = await addLocked(page);
  await dialog.getByRole('button', { name: 'No abrirlo' }).click();
  await expect(page.getByText('no se abrió porque está protegido')).toBeVisible();
  await expect(pageCards(page)).toHaveCount(0);
});

test('a file that only restricts what readers may do opens, and its restrictions are kept on export', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('encrypted-owner-restricted.pdf')]);
  await expect(pageCards(page)).toHaveCount(1);
  const dialog = await openExportDialog(page);
  await expect(dialog).toContainText('restricciones de su autor');
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect(dialog).toContainText('Se han conservado las restricciones');
  const saved = await saveResult(page);
  const shown = qpdf(saved.bytes, ['--show-encryption']);
  expect(shown).toContain('R = 6');
  expect(shown).toMatch(/extract for any purpose: not allowed/);
  expect(shown).toMatch(/print high resolution: not allowed/);
});

test('with a restricted file, the owner password typed is not the owner of the result', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('encrypted-owner-restricted.pdf')]);
  await expect(pageCards(page)).toHaveCount(1);
  const dialog = await openExportDialog(page);
  await expect(dialog.getByLabel('Contraseña de permisos (opcional)')).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: 'Poner una contraseña al archivo' }).check();
  await dialog.getByLabel('Contraseña para abrirlo').fill('abrir-123');
  await dialog.getByLabel('Repite la contraseña').fill('abrir-123');
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
  const saved = await saveResult(page);
  expect(qpdf(saved.bytes, ['--password=wrong', '--show-encryption'])).toContain(
    'Incorrect password supplied',
  );
  const shown = qpdf(saved.bytes, ['--password=abrir-123', '--show-encryption']);
  expect(shown).toContain('User password = abrir-123');
  expect(shown).toMatch(/extract for any purpose: not allowed/);
});

test('protects a result with a password and permissions, and will not export with passwords that differ', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('mixed-sizes-3p.pdf')]);
  await expect(pageCards(page)).toHaveCount(3);
  const dialog = await openExportDialog(page);
  await dialog.getByRole('checkbox', { name: 'Poner una contraseña al archivo' }).check();
  await dialog.getByLabel('Contraseña para abrirlo').fill('secreto-1');
  await dialog.getByLabel('Repite la contraseña').fill('secreto-2');
  await expect(dialog.getByRole('alert')).toContainText('no coinciden');
  await expect(dialog.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();
  await dialog.getByLabel('Repite la contraseña').fill('secreto-1');
  await dialog.getByRole('checkbox', { name: 'Copiar el contenido' }).uncheck();
  await dialog.getByLabel('Contraseña de permisos (opcional)').fill('permisos-9');
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect(dialog).toContainText('pedirá la contraseña');
  const saved = await saveResult(page);
  expect(qpdf(saved.bytes, ['--check'])).toMatch(/invalid password|password/i);
  const shown = qpdf(saved.bytes, ['--password=secreto-1', '--show-encryption']);
  expect(shown).toContain('R = 6');
  expect(shown).toMatch(/extract for any purpose: not allowed/);
  expect(shown).toMatch(/print high resolution: allowed/);
  expect(qpdf(saved.bytes, ['--password=permisos-9', '--show-encryption'])).toContain(
    'owner password',
  );
});

test('the password is not kept: after saving, the protection form starts empty', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('single-1p.pdf')]);
  await expect(pageCards(page)).toHaveCount(1);
  const dialog = await openExportDialog(page);
  await dialog.getByRole('checkbox', { name: 'Poner una contraseña al archivo' }).check();
  await dialog.getByLabel('Contraseña para abrirlo').fill('solo-una-vez');
  await dialog.getByLabel('Repite la contraseña').fill('solo-una-vez');
  await dialog.getByRole('button', { name: 'Exportar PDF' }).click();
  await saveResult(page);
  // The dialog goes back to its form, and the passwords typed for the file are gone.
  await expect(
    dialog.getByRole('checkbox', { name: 'Poner una contraseña al archivo' }),
  ).not.toBeChecked();
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain(
    'solo-una-vez',
  );
});

for (const language of ['Español', 'English'] as const) {
  test(`the password dialog and the protection form have no accessibility violations in ${language}`, async ({
    page,
  }) => {
    if (language === 'English') {
      await openApp(page);
      await page.getByRole('button', { name: 'English' }).click();
      await page.getByTestId('file-input').setInputFiles([fixture('encrypted-user-password.pdf')]);
      await expect(page.getByRole('dialog')).toBeVisible();
    } else {
      await addLocked(page);
    }
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
}

test('the protection form has no accessibility violations', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles([fixture('single-1p.pdf')]);
  await expect(pageCards(page)).toHaveCount(1);
  const dialog = await openExportDialog(page);
  await dialog.getByRole('checkbox', { name: 'Poner una contraseña al archivo' }).check();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});
