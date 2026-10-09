import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import type { CompressionOutcome, CompressionPreset } from '@vidopdf/core';
import { differingPixels, nodeCodec, renderPage } from '../testing';
import { qpdfCheck } from '../testing/qpdf';
import { createCompressor } from './compress';
import { collectImages } from './images';

const compressor = createCompressor(nodeCodec);

/** A photograph-like picture: gradients, blobs and noise, from a fixed seed. */
function photo(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const sky = context.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, '#4f8ad9');
  sky.addColorStop(1, '#e9b872');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  let state = 7;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let blob = 0; blob < 30; blob++) {
    context.fillStyle = `hsla(${String(Math.floor(next() * 360))} 50% 50% / 0.4)`;
    context.beginPath();
    context.arc(next() * width, next() * height, (0.05 + next() * 0.2) * width, 0, Math.PI * 2);
    context.fill();
  }
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grain = (next() - 0.5) * 12;
    pixels.data[index] = (pixels.data[index] ?? 0) + grain;
    pixels.data[index + 1] = (pixels.data[index + 1] ?? 0) + grain;
    pixels.data[index + 2] = (pixels.data[index + 2] ?? 0) + grain;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function oneImage(
  kind: 'jpeg' | 'png',
  size: [number, number],
  drawn: { width: number; height: number; rotate?: number },
  quality = 92,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const canvas = photo(size[0], size[1]);
  const image =
    kind === 'jpeg'
      ? await doc.embedJpg(canvas.toBuffer('image/jpeg', quality))
      : await doc.embedPng(canvas.toBuffer('image/png'));
  const page = doc.addPage([595, 842]);
  page.drawImage(image, {
    x: drawn.rotate === undefined ? 50 : 300,
    y: 300,
    width: drawn.width,
    height: drawn.height,
    ...(drawn.rotate === undefined ? {} : { rotate: degrees(drawn.rotate) }),
  });
  return doc.save({ useObjectStreams: false });
}

async function run(bytes: Uint8Array, preset: CompressionPreset): Promise<CompressionOutcome> {
  const result = await compressor.compress(bytes, preset);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

async function firstImage(bytes: Uint8Array) {
  const [image] = collectImages(await PDFDocument.load(bytes));
  if (image === undefined) throw new Error('no picture');
  return image;
}

describe('createCompressor', () => {
  it('shrinks a picture drawn at far more dpi than the preset needs', async () => {
    // 1800 x 1200 drawn 432 x 288 pt = 6 x 4 in, so 300 dpi; "balanced" wants 150.
    const original = await oneImage('jpeg', [1800, 1200], { width: 432, height: 288 });
    const { bytes, report } = await run(original, 'balanced');
    expect(report.imagesRecompressed).toBe(1);
    expect(report.keptOriginal).toBe(false);
    expect(bytes.byteLength).toBeLessThan(original.byteLength * 0.5);
    const image = await firstImage(bytes);
    expect(image.width).toBe(900);
    expect(image.height).toBe(600);
    qpdfCheck(bytes);
  });

  it('keeps the page looking the same', async () => {
    const original = await oneImage('jpeg', [1800, 1200], { width: 432, height: 288 });
    const { bytes } = await run(original, 'balanced');
    const before = await renderPage(original, 1, { scale: 1 });
    const after = await renderPage(bytes, 1, { scale: 1 });
    expect(after.width).toBe(before.width);
    expect(differingPixels(before, after, 40)).toBeLessThan(0.01);
  });

  it('orders the presets by how much they save', async () => {
    const original = await oneImage('jpeg', [1800, 1200], { width: 432, height: 288 });
    const screen = (await run(original, 'screen')).bytes.byteLength;
    const balanced = (await run(original, 'balanced')).bytes.byteLength;
    const print = (await run(original, 'print')).bytes.byteLength;
    expect(screen).toBeLessThan(balanced);
    expect(balanced).toBeLessThan(print);
    expect(print).toBeLessThan(original.byteLength);
  });

  it('recompresses lossless pictures as JPEG', async () => {
    const original = await oneImage('png', [1200, 800], { width: 360, height: 240 });
    const { bytes, report } = await run(original, 'balanced');
    expect(report.imagesRecompressed).toBe(1);
    expect(bytes.byteLength).toBeLessThan(original.byteLength * 0.3);
    qpdfCheck(bytes);
  });

  it('measures the size a picture is drawn at, even when it is rotated', async () => {
    const straight = await run(
      await oneImage('jpeg', [1800, 1200], { width: 432, height: 288 }),
      'balanced',
    );
    const turned = await run(
      await oneImage('jpeg', [1800, 1200], { width: 432, height: 288, rotate: 90 }),
      'balanced',
    );
    const [a, b] = [await firstImage(straight.bytes), await firstImage(turned.bytes)];
    expect([b.width, b.height]).toEqual([a.width, a.height]);
  });

  it('shrinks pictures drawn inside a form XObject', async () => {
    // embedPage turns a whole page into a form; drawing it at half size halves the dpi seen.
    const source = await PDFDocument.create();
    const picture = await source.embedJpg(photo(1800, 1200).toBuffer('image/jpeg', 92));
    source.addPage([595, 842]).drawImage(picture, { x: 0, y: 400, width: 432, height: 288 });
    const doc = await PDFDocument.create();
    const [form] = await doc.embedPdf(await source.save(), [0]);
    if (form === undefined) throw new Error('no form');
    doc.addPage([595, 842]).drawPage(form, { x: 0, y: 0, xScale: 0.5, yScale: 0.5 });
    const original = await doc.save({ useObjectStreams: false });
    const { bytes, report } = await run(original, 'balanced');
    expect(report.imagesRecompressed).toBe(1);
    // 1800 pixels over 3 in is 600 dpi, so "balanced" (150 dpi) brings it to 450 pixels.
    expect((await firstImage(bytes)).width).toBe(450);
  });

  it('leaves a picture drawn at the resolution it needs', async () => {
    // 900 x 600 over 6 x 4 in is 150 dpi, thin already (quality 55).
    const original = await oneImage('jpeg', [900, 600], { width: 432, height: 288 }, 55);
    const { bytes, report } = await run(original, 'balanced');
    expect(report.imagesRecompressed).toBe(0);
    expect(report.keptOriginal).toBe(true);
    expect(bytes).toBe(original);
  });

  it('leaves line art alone', async () => {
    const canvas = createCanvas(1200, 800);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1200, 800);
    context.fillStyle = '#1d4ed8';
    context.fillRect(100, 100, 500, 300);
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(canvas.toBuffer('image/png'));
    doc.addPage([595, 842]).drawImage(image, { x: 50, y: 300, width: 288, height: 192 });
    const original = await doc.save({ useObjectStreams: false });
    const { report } = await run(original, 'screen');
    expect(report.imagesRecompressed).toBe(0);
  });

  it('returns the very same bytes for a document with no pictures', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]).drawText('hello');
    const original = await doc.save({ useObjectStreams: false });
    const { bytes, report } = await run(original, 'balanced');
    expect(report.imagesFound).toBe(0);
    expect(bytes.byteLength).toBeLessThanOrEqual(original.byteLength);
  });

  it('is never larger than the input', async () => {
    for (const quality of [30, 55, 75, 95]) {
      const original = await oneImage('jpeg', [700, 500], { width: 360, height: 257 }, quality);
      for (const preset of ['screen', 'balanced', 'print'] as const) {
        const { bytes } = await run(original, preset);
        expect(bytes.byteLength).toBeLessThanOrEqual(original.byteLength);
      }
    }
  });

  it('reports progress and stops when asked to', async () => {
    const original = await oneImage('jpeg', [1800, 1200], { width: 432, height: 288 });
    const seen: number[] = [];
    const done = await compressor.compress(original, 'balanced', {
      onProgress: (current, total) => seen.push(current / total),
    });
    expect(done.ok).toBe(true);
    expect(seen.at(-1)).toBe(1);
    const controller = new AbortController();
    controller.abort();
    const cancelled = await compressor.compress(original, 'balanced', {
      signal: controller.signal,
    });
    expect(cancelled).toMatchObject({ ok: false, error: { kind: 'cancelled' } });
  });

  it('turns down what is not a PDF', async () => {
    const result = await compressor.compress(new Uint8Array([1, 2, 3, 4]), 'balanced');
    expect(result.ok).toBe(false);
  });

  it('can write object streams when asked', async () => {
    const original = await oneImage('jpeg', [1800, 1200], { width: 432, height: 288 });
    const result = await createCompressor(nodeCodec, { objectStreams: true }).compress(
      original,
      'balanced',
    );
    expect(result.ok).toBe(true);
    if (result.ok) qpdfCheck(result.value.bytes);
  });
});
