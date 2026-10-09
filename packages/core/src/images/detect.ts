export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif';

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  signature.every((value, index) => bytes[at + index] === value);

/** What a file really is, from its first bytes. A file name or MIME type is only a claim. */
export function detectImageKind(bytes: Uint8Array): ImageKind | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  const riff = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]);
  if (riff && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return undefined;
}

/** Only these can become a PDF page (SPEC: JPEG and PNG). */
export function isSupportedImage(kind: ImageKind | undefined): kind is 'jpeg' | 'png' {
  return kind === 'jpeg' || kind === 'png';
}
