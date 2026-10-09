import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { expect } from '@playwright/test';
import { unzipSync } from 'fflate';
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

/** Opens the export dialog from the top bar. */
export async function openExportDialog(page: Page): Promise<Locator> {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^(Exportar|Export)$/ })
    .click();
  const dialog = page.getByRole('dialog', { name: /^(Exportar|Export)$/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Saves what the dialog finished building and returns the downloaded file. */
export async function saveResult(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const dialog = page.getByRole('dialog', { name: /^(Exportar|Export)$/ });
  const save = dialog.getByRole('button', { name: /^(Guardar|Save)$/ });
  await expect(save).toBeVisible();
  const download = page.waitForEvent('download');
  await save.click();
  const file = await download;
  const { readFile } = await import('node:fs/promises');
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

/** Exports everything as one PDF and returns the downloaded bytes. */
export async function exportPdf(page: Page): Promise<Buffer> {
  const dialog = await openExportDialog(page);
  await dialog.getByRole('button', { name: /^(Exportar PDF|Export PDF)$/ }).click();
  return (await saveResult(page)).bytes;
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

/** Page count of a PDF written by Vidopdf (a single page tree: the first /Count is the total). */
export function pdfPageCount(bytes: Uint8Array): number {
  const match = /\/Count (\d+)/.exec(Buffer.from(bytes).toString('latin1'));
  return match === null ? -1 : Number(match[1]);
}

/** Width and height of a PNG, from its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function unzipFiles(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

export function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const;
export const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;

/** A picture with a visible gradient, as the bytes a file input needs. */
export function pictureFile(
  name: string,
  format: 'png' | 'jpeg' | 'webp',
  width = 400,
  height = 300,
  orientation?: number,
): { name: string; mimeType: string; buffer: Buffer } {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1d4ed8');
  gradient.addColorStop(1, '#f59e0b');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const mimeType = `image/${format}`;
  const encoded: Uint8Array = new Uint8Array(canvas.toBuffer(mimeType as 'image/png'));
  const bytes = orientation === undefined ? encoded : withExifOrientation(encoded, orientation);
  return { name, mimeType, buffer: Buffer.from(bytes) };
}

/** Inserts an EXIF segment recording `orientation` right after the JPEG start marker. */
function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(26));
  tiff.setUint16(0, 0x4d4d);
  tiff.setUint16(2, 42);
  tiff.setUint32(4, 8);
  tiff.setUint16(8, 1);
  tiff.setUint16(10, 0x0112);
  tiff.setUint16(12, 3);
  tiff.setUint32(14, 1);
  tiff.setUint16(18, orientation);
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)];
  const length = payload.length + 2;
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    length >> 8,
    length & 0xff,
    ...payload,
    ...jpeg.slice(2),
  ]);
}

/** Width and height of the first page of a one-page PDF (its MediaBox). */
export function mediaBox(bytes: Uint8Array): { width: number; height: number } {
  const match = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(
    Buffer.from(bytes).toString('latin1'),
  );
  return { width: Number(match?.[1]), height: Number(match?.[2]) };
}

/** Loads the five-page workspace and opens the export dialog on the given tab. */
export async function openExportTab(page: Page, tab: RegExp | string): Promise<Locator> {
  const dialog = await openExportDialog(page);
  await dialog.getByRole('radio', { name: tab }).check();
  return dialog;
}
