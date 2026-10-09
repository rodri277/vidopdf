import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import type { Canvas } from '@napi-rs/canvas';

/**
 * A corpus of PDFs for measuring compression. The pictures are synthetic photographs drawn from
 * fixed seeds (landscapes of gradients, blobs, strokes and sensor-like noise): they have the
 * statistics that make JPEG behave like it does on photographs, but they are not photographs, and
 * real ones may compress differently. Generated into an ignored folder on first use.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '../../.fixtures/compression');
const A4: [number, number] = [595, 842];

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** A photograph-like picture: sky and ground gradients, soft blobs, fine strokes and sensor noise. */
export function syntheticPhoto(width: number, height: number, seed: number): Canvas {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const next = random(seed);
  const sky = context.createLinearGradient(0, 0, 0, height * 0.6);
  sky.addColorStop(0, `hsl(${String(200 + next() * 30)} 60% 60%)`);
  sky.addColorStop(1, `hsl(${String(30 + next() * 30)} 70% 85%)`);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  const ground = context.createLinearGradient(0, height * 0.55, 0, height);
  ground.addColorStop(0, `hsl(${String(90 + next() * 40)} 40% 35%)`);
  ground.addColorStop(1, `hsl(${String(30 + next() * 20)} 35% 20%)`);
  context.fillStyle = ground;
  context.fillRect(0, height * 0.55, width, height * 0.45);
  for (let blob = 0; blob < 40; blob++) {
    const x = next() * width;
    const y = next() * height;
    const radius = (0.02 + next() * 0.15) * Math.min(width, height);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const hue = String(Math.floor(next() * 360));
    gradient.addColorStop(0, `hsla(${hue} 55% 55% / 0.55)`);
    gradient.addColorStop(1, `hsla(${hue} 55% 55% / 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.lineWidth = Math.max(1, width / 1200);
  for (let stroke = 0; stroke < 2500; stroke++) {
    const x = next() * width;
    const y = height * (0.5 + next() * 0.5);
    context.strokeStyle = `hsla(${String(60 + next() * 80)} 45% ${String(20 + next() * 30)}% / 0.5)`;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (next() - 0.5) * width * 0.02, y - next() * height * 0.06);
    context.stroke();
  }
  // Sensor noise, as every real photograph has.
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grain = (next() - 0.5) * 14;
    pixels.data[index] = (pixels.data[index] ?? 0) + grain;
    pixels.data[index + 1] = (pixels.data[index + 1] ?? 0) + grain;
    pixels.data[index + 2] = (pixels.data[index + 2] ?? 0) + grain;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/** A page of a scanned document: paper tint, rows of "text" and a little grain. */
function scanPage(width: number, height: number, seed: number): Canvas {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const next = random(seed);
  context.fillStyle = '#f2efe6';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#2a2a2a';
  for (let y = height * 0.08; y < height * 0.92; y += height * 0.013) {
    for (let x = width * 0.1; x < width * 0.9;) {
      const word = width * (0.015 + next() * 0.05);
      context.fillRect(x, y, Math.min(word, width * 0.9 - x), height * 0.005);
      x += word + width * 0.01;
    }
  }
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grain = (next() - 0.5) * 10;
    pixels.data[index] = (pixels.data[index] ?? 0) + grain;
    pixels.data[index + 1] = (pixels.data[index + 1] ?? 0) + grain;
    pixels.data[index + 2] = (pixels.data[index + 2] ?? 0) + grain;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/** A diagram: flat colours and straight lines, a few dozen colours at most. */
function diagram(width: number, height: number): Canvas {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  const colors = ['#1d4ed8', '#f59e0b', '#16a34a', '#dc2626', '#7c3aed', '#0891b2'];
  colors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(
      width * 0.08 + index * width * 0.15,
      height * (0.2 + (index % 3) * 0.2),
      width * 0.12,
      height * 0.15,
    );
    context.strokeStyle = '#111827';
    context.lineWidth = 4;
    context.strokeRect(
      width * 0.08 + index * width * 0.15,
      height * (0.2 + (index % 3) * 0.2),
      width * 0.12,
      height * 0.15,
    );
  });
  return canvas;
}

export interface CorpusCase {
  readonly name: string;
  readonly description: string;
  /** Whether SPEC's "photographs" target applies to it. */
  readonly photographic: boolean;
  readonly path: string;
}

async function newDoc(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  return doc;
}

async function jpeg(doc: PDFDocument, canvas: Canvas, quality: number) {
  return doc.embedJpg(canvas.toBuffer('image/jpeg', quality));
}

type Builder = () => Promise<Uint8Array>;

const builders: readonly {
  name: string;
  description: string;
  photographic: boolean;
  build: Builder;
}[] = [
  {
    name: 'photos-full-page-300dpi',
    description:
      'Four pages, each one A4 photograph of 2480 x 3508 pixels (300 dpi), JPEG quality 92',
    photographic: true,
    build: async () => {
      const doc = await newDoc();
      for (let page = 0; page < 4; page++) {
        const picture = await jpeg(doc, syntheticPhoto(2480, 3508, 10 + page), 92);
        doc.addPage(A4).drawImage(picture, { x: 0, y: 0, width: A4[0], height: A4[1] });
      }
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'report-with-photos',
    description: 'Four pages of text with two photographs each, drawn at 300 and 600 dpi',
    photographic: true,
    build: async () => {
      const doc = await newDoc();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (let page = 0; page < 4; page++) {
        const sheet = doc.addPage(A4);
        for (let line = 0; line < 20; line++)
          sheet.drawText(
            `Paragraph ${String(line)} of page ${String(page)}: lorem ipsum dolor sit amet.`,
            { x: 50, y: 800 - line * 14, size: 9, font },
          );
        const large = await jpeg(doc, syntheticPhoto(1800, 1200, 20 + page), 90);
        sheet.drawImage(large, { x: 50, y: 400, width: 432, height: 288 }); // 300 dpi
        const small = await jpeg(doc, syntheticPhoto(1200, 800, 30 + page), 90);
        sheet.drawImage(small, { x: 50, y: 100, width: 144, height: 96 }); // 600 dpi
      }
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'photos-lossless',
    description:
      'Three pages, each with a 1600 x 1100 photograph stored without loss (PNG, Flate), drawn at 250 dpi',
    photographic: true,
    build: async () => {
      const doc = await newDoc();
      for (let page = 0; page < 3; page++) {
        const picture = await doc.embedPng(
          syntheticPhoto(1600, 1100, 40 + page).toBuffer('image/png'),
        );
        doc.addPage(A4).drawImage(picture, { x: 40, y: 300, width: 460, height: 316 });
      }
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'phone-album',
    description:
      'Six pages, each with a 3000 x 2250 phone-style photograph (JPEG 90) drawn 6.5 inches wide (460 dpi)',
    photographic: true,
    build: async () => {
      const doc = await newDoc();
      for (let page = 0; page < 6; page++) {
        const picture = await jpeg(doc, syntheticPhoto(3000, 2250, 50 + page), 90);
        doc.addPage(A4).drawImage(picture, { x: 63, y: 300, width: 468, height: 351 });
      }
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'huge-picture-small-place',
    description: 'One 4000 x 3000 photograph (JPEG 90) drawn 3 inches wide (1333 dpi)',
    photographic: true,
    build: async () => {
      const doc = await newDoc();
      const picture = await jpeg(doc, syntheticPhoto(4000, 3000, 60), 90);
      doc.addPage(A4).drawImage(picture, { x: 100, y: 500, width: 216, height: 162 });
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'scanned-document',
    description: 'Four scanned text pages, 2480 x 3508 pixels (300 dpi), JPEG quality 80',
    photographic: false,
    build: async () => {
      const doc = await newDoc();
      for (let page = 0; page < 4; page++) {
        const picture = await jpeg(doc, scanPage(2480, 3508, 70 + page), 80);
        doc.addPage(A4).drawImage(picture, { x: 0, y: 0, width: A4[0], height: A4[1] });
      }
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'already-optimised',
    description:
      'Two pages with a 900 x 600 photograph at JPEG quality 55 drawn 6 inches wide (150 dpi): nothing to gain',
    photographic: false,
    build: async () => {
      const doc = await newDoc();
      for (let page = 0; page < 2; page++) {
        const picture = await jpeg(doc, syntheticPhoto(900, 600, 80 + page), 55);
        doc.addPage(A4).drawImage(picture, { x: 80, y: 300, width: 432, height: 288 });
      }
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'diagram',
    description:
      'One 1600 x 1200 diagram of flat colours stored without loss, drawn at 300 dpi: JPEG would blur it',
    photographic: false,
    build: async () => {
      const doc = await newDoc();
      const picture = await doc.embedPng(diagram(1600, 1200).toBuffer('image/png'));
      doc.addPage(A4).drawImage(picture, { x: 40, y: 300, width: 384, height: 288 });
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    name: 'text-only',
    description: 'Thirty pages of text and no pictures at all',
    photographic: false,
    build: async () => {
      const doc = await newDoc();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (let page = 0; page < 30; page++) {
        const sheet = doc.addPage(A4);
        sheet.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(0.98, 0.98, 1) });
        for (let line = 0; line < 50; line++)
          sheet.drawText(
            `Page ${String(page)} line ${String(line)}: the quick brown fox jumps over the lazy dog`,
            { x: 50, y: 800 - line * 15, size: 9, font },
          );
      }
      return doc.save({ useObjectStreams: false });
    },
  },
];

/** Builds whatever is missing and lists the corpus. */
export async function ensureCorpus(): Promise<CorpusCase[]> {
  mkdirSync(root, { recursive: true });
  const cases: CorpusCase[] = [];
  for (const { name, description, photographic, build } of builders) {
    const path = join(root, `${name}.pdf`);
    if (!existsSync(path)) writeFileSync(path, await build());
    cases.push({ name, description, photographic, path });
  }
  return cases;
}
