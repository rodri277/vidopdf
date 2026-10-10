import { PDFArray, PDFDict, PDFHexString, PDFRef, PDFStream, PDFString } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFObject } from '@cantoo/pdf-lib';

type Encrypt = (bytes: Uint8Array) => Uint8Array;

const isText = (value: PDFObject | undefined): value is PDFString | PDFHexString =>
  value instanceof PDFString || value instanceof PDFHexString;

function hexOf(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function sealed(value: PDFString | PDFHexString, encrypt: Encrypt): PDFHexString {
  return PDFHexString.of(hexOf(encrypt(value.asBytes())));
}

function sealAll(object: PDFObject, encrypt: Encrypt): void {
  if (object instanceof PDFStream) sealAll(object.dict, encrypt);
  else if (object instanceof PDFDict) {
    for (const [key, value] of object.entries()) {
      if (isText(value)) object.set(key, sealed(value, encrypt));
      else sealAll(value, encrypt);
    }
  } else if (object instanceof PDFArray) {
    for (let index = 0; index < object.size(); index++) {
      const value = object.get(index);
      if (isText(value)) object.set(index, sealed(value, encrypt));
      else sealAll(value, encrypt);
    }
  }
}

/**
 * The library encrypts the streams of a document it encrypts, but writes its text strings (the
 * title and author, the names of bookmarks and fields, what was typed in a form, the address of
 * a link) as they are, so every reader would decrypt them into garbage. This encrypts them too,
 * the way ISO 32000 asks, leaving the encryption dictionary itself alone.
 */
export function encryptStrings(doc: PDFDocument): void {
  const { security, trailerInfo } = doc.context;
  if (security === undefined) return;
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (ref === trailerInfo.Encrypt || object instanceof PDFRef) continue;
    sealAll(object, security.getEncryptFn(ref.objectNumber, ref.generationNumber));
  }
}
