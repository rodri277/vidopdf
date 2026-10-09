/** Why a PDF could not be used. The UI maps each kind to a translated message. */
export type PdfErrorKind =
  | 'empty' // zero bytes or no pages
  | 'corrupt' // truncated, damaged xref or not a PDF
  | 'encrypted' // v1 rejects every encrypted PDF, owner-restricted ones included
  | 'unsupported'
  | 'cancelled'
  | 'internal';

export interface PdfError {
  readonly kind: PdfErrorKind;
  /** Technical detail for logs and bug reports. Never shown as the user-facing message. */
  readonly detail?: string;
}

export function pdfError(kind: PdfErrorKind, detail?: string): PdfError {
  return detail === undefined ? { kind } : { kind, detail };
}
