import {
  PDFDocument,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib';
import {
  detectImageKind,
  err,
  jpegOrientation,
  ok,
  orientationMatrix,
  pdfError,
  placeImage,
  swapsAxes,
} from '@vidopdf/core';
import type { ImagePageOptions, PdfError, Result } from '@vidopdf/core';

/**
 * A one-page PDF holding a JPEG or PNG. The file type is read from its bytes, not its name, and a
 * JPEG's EXIF orientation is honoured so phone photos are not left lying on their side.
 */
export async function imageToPdf(
  bytes: Uint8Array,
  options: ImagePageOptions,
): Promise<Result<Uint8Array, PdfError>> {
  if (bytes.byteLength === 0) return err(pdfError('empty'));
  const kind = detectImageKind(bytes);
  if (kind !== 'jpeg' && kind !== 'png') {
    return err(
      pdfError('unsupported', kind === undefined ? 'not an image' : `${kind} is not supported`),
    );
  }
  try {
    const doc = await PDFDocument.create();
    const image = await (kind === 'jpeg' ? doc.embedJpg(bytes) : doc.embedPng(bytes));
    const orientation = kind === 'jpeg' ? jpegOrientation(bytes) : 1;
    // Lay the picture out as it will be seen: quarter turns trade its width and height.
    const [shownWidth, shownHeight] = swapsAxes(orientation)
      ? [image.height, image.width]
      : [image.width, image.height];
    const placement = placeImage(shownWidth, shownHeight, options);
    const page = doc.addPage([placement.pageWidth, placement.pageHeight]);
    const name = page.node.newXObject('Image', image.ref);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...orientationMatrix(orientation, placement)),
      drawObject(name),
      popGraphicsState(),
    );
    return ok(await doc.save({ useObjectStreams: false }));
  } catch (error) {
    return err(pdfError('corrupt', error instanceof Error ? error.message : String(error)));
  }
}
