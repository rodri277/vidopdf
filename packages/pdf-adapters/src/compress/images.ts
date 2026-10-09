import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import type { PDFContext, PDFDocument, PDFObject, PDFRef } from '@cantoo/pdf-lib';

/** A picture inside a PDF that this version knows how to compress. */
export interface CompressibleImage {
  readonly ref: PDFRef;
  readonly stream: PDFRawStream;
  readonly width: number;
  readonly height: number;
  readonly source: 'jpeg' | 'flate';
  readonly colors: 1 | 3;
}

const asNumber = (context: PDFContext, value: PDFObject | undefined): number | undefined => {
  const resolved = value === undefined ? undefined : context.lookup(value);
  return resolved instanceof PDFNumber ? resolved.asNumber() : undefined;
};

/** The single filter of a stream, or undefined when there are several or none. */
function singleFilter(context: PDFContext, dict: PDFDict): string | undefined {
  const raw = dict.get(PDFName.of('Filter'));
  const filter = raw === undefined ? undefined : context.lookup(raw);
  if (filter instanceof PDFName) return filter.decodeText();
  if (filter instanceof PDFArray && filter.size() === 1) {
    const only = context.lookup(filter.get(0));
    return only instanceof PDFName ? only.decodeText() : undefined;
  }
  return undefined;
}

const toComponents = (n: number | undefined): 1 | 3 | undefined =>
  n === 1 ? 1 : n === 3 ? 3 : undefined;

/** `[/ICCBased stream]`: the profile says how many components there are. */
function iccComponents(context: PDFContext, space: PDFArray): 1 | 3 | undefined {
  if (space.size() !== 2) return undefined;
  const kind = context.lookup(space.get(0));
  const profile = context.lookup(space.get(1));
  if (!(kind instanceof PDFName) || kind.decodeText() !== 'ICCBased') return undefined;
  if (!(profile instanceof PDFRawStream)) return undefined;
  return toComponents(asNumber(context, profile.dict.get(PDFName.of('N'))));
}

/** 1 for grey, 3 for RGB, undefined for everything else (CMYK, indexed, calibrated, spot...). */
function colorComponents(context: PDFContext, dict: PDFDict): 1 | 3 | undefined {
  const raw = dict.get(PDFName.of('ColorSpace'));
  const space = raw === undefined ? undefined : context.lookup(raw);
  if (space instanceof PDFArray) return iccComponents(context, space);
  if (!(space instanceof PDFName)) return undefined;
  const name = space.decodeText();
  return name === 'DeviceGray' ? 1 : name === 'DeviceRGB' ? 3 : undefined;
}

/** Anything that changes how the samples are read makes a picture one this version leaves alone. */
const UNSUPPORTED_KEYS = ['SMask', 'Mask', 'Decode', 'ImageMask', 'Intent'] as const;

function isPlainImage(dict: PDFDict): boolean {
  const subtype = dict.get(PDFName.of('Subtype'));
  return (
    subtype instanceof PDFName &&
    subtype.decodeText() === 'Image' &&
    !UNSUPPORTED_KEYS.some((key) => dict.has(PDFName.of(key)))
  );
}

function describeImage(
  context: PDFContext,
  ref: PDFRef,
  stream: PDFRawStream,
): CompressibleImage | undefined {
  const dict = stream.dict;
  if (!isPlainImage(dict)) return undefined;
  const filter = singleFilter(context, dict);
  const colors = colorComponents(context, dict);
  const width = asNumber(context, dict.get(PDFName.of('Width')));
  const height = asNumber(context, dict.get(PDFName.of('Height')));
  const bits = asNumber(context, dict.get(PDFName.of('BitsPerComponent')));
  if (colors === undefined || width === undefined || height === undefined || bits !== 8)
    return undefined;
  if (filter !== 'DCTDecode' && filter !== 'FlateDecode') return undefined;
  return { ref, stream, width, height, source: filter === 'DCTDecode' ? 'jpeg' : 'flate', colors };
}

/** Every picture of the document this version can compress, once each. */
export function collectImages(doc: PDFDocument): CompressibleImage[] {
  const found: CompressibleImage[] = [];
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const image = describeImage(doc.context, ref, object);
    if (image !== undefined) found.push(image);
  }
  return found;
}

/** The decoded samples of a Flate picture (predictors undone), or undefined if they do not add up. */
export function flateSamples(image: CompressibleImage): Uint8Array | undefined {
  const samples = decodePDFRawStream(image.stream).decode();
  return samples.length >= image.width * image.height * image.colors ? samples : undefined;
}

export function jpegBytes(image: CompressibleImage): Uint8Array {
  return image.stream.getContents();
}

/** Tells apart references that point at the same object. */
export const refKey = (ref: PDFRef): string => ref.toString();

export { PDFDict };
