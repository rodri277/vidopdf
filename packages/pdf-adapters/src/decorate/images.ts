import type { PDFDocument, PDFImage } from '@cantoo/pdf-lib';

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((value, index) => bytes[index] === value);

/** Pictures used by stamps and signatures, embedded once per document however often they appear. */
export class ImageCache {
  readonly #embedded = new Map<string, Promise<PDFImage>>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly assets: ReadonlyMap<string, Uint8Array>,
  ) {}

  /** The embedded picture, or undefined when the asset is missing or is neither PNG nor JPEG. */
  get(assetId: string): Promise<PDFImage> | undefined {
    const bytes = this.assets.get(assetId);
    if (bytes === undefined) return undefined;
    let image = this.#embedded.get(assetId);
    if (image === undefined) {
      if (startsWith(bytes, PNG)) image = this.doc.embedPng(bytes);
      else if (startsWith(bytes, JPEG)) image = this.doc.embedJpg(bytes);
      else return undefined;
      this.#embedded.set(assetId, image);
    }
    return image;
  }
}
