import { PDFDocument, PDFRawStream } from '@cantoo/pdf-lib';
import {
  acceptable,
  decideImage,
  err,
  neverLarger,
  ok,
  pdfError,
  settingsFor,
} from '@vidopdf/core';
import type {
  CompressionOptions,
  CompressionOutcome,
  CompressionPreset,
  CompressionSettings,
  Compressor,
  ImageDecision,
  PdfError,
  Result,
} from '@vidopdf/core';
import type { ImageCodec, Raster } from './codec';
import { collectImages, flateSamples, jpegBytes, refKey } from './images';
import type { CompressibleImage } from './images';
import { effectiveDpis } from './placements';
import { looksLikeLineArt, rasterFromSamples } from './samples';

export interface CompressorOptions {
  /**
   * Write the output with object streams, which shrinks the structure of the file (and so helps
   * documents with no pictures). Off by default: it gains 0 to 2 % only (ADR 004).
   */
  readonly objectStreams?: boolean;
  /** Replaces the settings of a preset. Used to compare strategies when measuring. */
  readonly settings?: (preset: CompressionPreset) => CompressionSettings;
}

interface Prepared {
  /** Present for lossless pictures, whose samples had to be read to tell what they are. */
  readonly samples: Uint8Array | undefined;
  readonly lineArt: boolean;
}

function prepare(image: CompressibleImage): Prepared | undefined {
  if (image.source === 'jpeg') return { samples: undefined, lineArt: false };
  const samples = flateSamples(image);
  return samples === undefined
    ? undefined
    : { samples, lineArt: looksLikeLineArt(samples, image.colors) };
}

async function rasterOf(
  image: CompressibleImage,
  prepared: Prepared,
  codec: ImageCodec,
): Promise<Raster> {
  return prepared.samples === undefined
    ? codec.decodeJpeg(jpegBytes(image))
    : rasterFromSamples(prepared.samples, image.width, image.height, image.colors);
}

/** Tries the decision; returns the new JPEG when it is worth having, nothing otherwise. */
async function encodeAgain(
  image: CompressibleImage,
  prepared: Prepared,
  decision: Extract<ImageDecision, { action: 'recompress' }>,
  codec: ImageCodec,
): Promise<Uint8Array | undefined> {
  try {
    const raster = await rasterOf(image, prepared, codec);
    const encoded = await codec.encodeJpeg(
      raster,
      decision.width,
      decision.height,
      decision.quality,
    );
    return acceptable(image.stream.getContentsSize(), encoded.length) ? encoded : undefined;
  } catch {
    // A picture that cannot be read or written again is simply left as it is.
    return undefined;
  }
}

function replace(
  doc: PDFDocument,
  image: CompressibleImage,
  width: number,
  height: number,
  jpeg: Uint8Array,
): void {
  const dict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'DCTDecode',
  });
  doc.context.assign(image.ref, PDFRawStream.of(dict, jpeg));
}

async function load(bytes: Uint8Array): Promise<Result<PDFDocument, PdfError>> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return doc.isEncrypted ? err(pdfError('encrypted')) : ok(doc);
  } catch (error) {
    return err(pdfError('corrupt', error instanceof Error ? error.message : String(error)));
  }
}

/** Decides about one picture and, when it is worth it, replaces it. True if it was replaced. */
async function recompress(
  doc: PDFDocument,
  image: CompressibleImage,
  effectiveDpi: number | undefined,
  settings: CompressionSettings,
  codec: ImageCodec,
): Promise<boolean> {
  const prepared = prepare(image);
  if (prepared === undefined) return false;
  const decision = decideImage(
    {
      width: image.width,
      height: image.height,
      source: image.source,
      bytes: image.stream.getContentsSize(),
      effectiveDpi,
      looksLikeLineArt: prepared.lineArt,
    },
    settings,
  );
  if (decision.action === 'keep') return false;
  const encoded = await encodeAgain(image, prepared, decision, codec);
  if (encoded === undefined) return false;
  replace(doc, image, decision.width, decision.height, encoded);
  return true;
}

/** Goes through the pictures; how many were replaced, or undefined if asked to stop. */
async function recompressAll(
  doc: PDFDocument,
  images: readonly CompressibleImage[],
  settings: CompressionSettings,
  codec: ImageCodec,
  options: CompressionOptions,
): Promise<number | undefined> {
  const dpis = effectiveDpis(doc, new Map(images.map((image) => [refKey(image.ref), image])));
  let replaced = 0;
  for (const [index, image] of images.entries()) {
    if (options.signal?.aborted === true) return undefined;
    options.onProgress?.(index, images.length);
    if (await recompress(doc, image, dpis.get(refKey(image.ref)), settings, codec)) replaced++;
  }
  options.onProgress?.(images.length, images.length);
  return replaced;
}

/**
 * Compressor for PDFs made of JPEG and lossless RGB or grey pictures: each picture drawn sharper
 * than the preset wants is shrunk to the resolution it is actually shown at, and encoded again as
 * a JPEG when that saves space. Everything else in the file is carried over untouched.
 */
export function createCompressor(
  codec: ImageCodec,
  compressorOptions: CompressorOptions = {},
): Compressor {
  async function compress(
    bytes: Uint8Array,
    preset: CompressionPreset,
    options: CompressionOptions = {},
  ): Promise<Result<CompressionOutcome, PdfError>> {
    const settings: CompressionSettings = (compressorOptions.settings ?? settingsFor)(preset);
    const loaded = await load(bytes);
    if (!loaded.ok) return loaded;
    const doc = loaded.value;
    const images = collectImages(doc);
    const recompressed = await recompressAll(doc, images, settings, codec, options);
    if (recompressed === undefined) return err(pdfError('cancelled'));
    const saved = await doc.save({ useObjectStreams: compressorOptions.objectStreams ?? false });
    const result = neverLarger(bytes, saved);
    return ok({
      bytes: result,
      report: {
        bytesBefore: bytes.byteLength,
        bytesAfter: result.byteLength,
        imagesFound: images.length,
        imagesRecompressed: recompressed,
        keptOriginal: result === bytes,
      },
    });
  }
  return { compress };
}
