import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';

/**
 * The large documents the benchmarks need. They are generated on first use into .fixtures (ignored
 * by git) from fixed seeds, so every run measures the same files.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '../.fixtures');
const A4: [number, number] = [595, 842];
const fixedDate = new Date('2026-01-01T00:00:00Z');

export const files = {
  text1000: join(root, 'text-1000.pdf'),
  text500: join(root, 'text-500.pdf'),
  scan500: join(root, 'scan-500.pdf'),
  mergeDir: join(root, 'merge-20'),
  merge: (index: number) =>
    join(root, 'merge-20', `part-${String(index + 1).padStart(2, '0')}.pdf`),
} as const;

async function textDocument(pageCount: number, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreationDate(fixedDate);
  doc.setModificationDate(fixedDate);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pageCount; n++) {
    const page = doc.addPage(A4);
    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(0.95, 0.97, 1) });
    page.drawText(`PAGE ${String(n)}`, { x: 60, y: 780, size: 28, font });
    for (let line = 0; line < 45; line++) {
      page.drawText(
        `Line ${String(line + 1)} of page ${String(n)}: the quick brown fox jumps over the lazy dog`,
        {
          x: 60,
          y: 740 - line * 15,
          size: 9,
          font,
        },
      );
    }
  }
  return doc.save({ useObjectStreams: false });
}

/** Pages that are one big photograph-like JPEG each: what makes real PDFs heavy. */
async function scanDocument(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(fixedDate);
  doc.setModificationDate(fixedDate);
  const canvas = createCanvas(1240, 1754); // A4 at 150 dpi
  const context = canvas.getContext('2d');
  let seed = 1;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let n = 0; n < pageCount; n++) {
    context.fillStyle = '#f4f1ea';
    context.fillRect(0, 0, 1240, 1754);
    // Noise gives the JPEG something to encode, like paper grain and photographs do.
    for (let blob = 0; blob < 2500; blob++) {
      context.fillStyle = `rgba(${String(Math.floor(random() * 120))},${String(Math.floor(random() * 120))},${String(Math.floor(random() * 120))},0.35)`;
      context.fillRect(random() * 1240, random() * 1754, 4 + random() * 60, 2 + random() * 14);
    }
    const jpeg = await doc.embedJpg(canvas.toBuffer('image/jpeg', 72));
    doc.addPage(A4).drawImage(jpeg, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  return doc.save({ useObjectStreams: false });
}

function ensure(path: string, make: () => Promise<Uint8Array>): Promise<void> {
  if (existsSync(path)) return Promise.resolve();
  mkdirSync(dirname(path), { recursive: true });
  return make().then((bytes) => {
    writeFileSync(path, bytes);
  });
}

/** Generates whatever is missing; safe to call before every run. */
export async function ensureFixtures(): Promise<void> {
  await ensure(files.text1000, () => textDocument(1000, 'Benchmark 1000 pages'));
  await ensure(files.text500, () => textDocument(500, 'Benchmark 500 pages'));
  await ensure(files.scan500, () => scanDocument(500));
  for (let index = 0; index < 20; index++) {
    await ensure(files.merge(index), () => textDocument(25, `Merge part ${String(index + 1)}`));
  }
}
