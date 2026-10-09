/** What a compression run did, shown to the user next to the new size. */
export interface CompressionReport {
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly imagesFound: number;
  readonly imagesRecompressed: number;
  /** True when nothing could be saved and the original was kept. */
  readonly keptOriginal: boolean;
}

/** Fraction saved, 0 to 1 (0 when nothing was). */
export function savedFraction(
  report: Pick<CompressionReport, 'bytesBefore' | 'bytesAfter'>,
): number {
  if (report.bytesBefore <= 0) return 0;
  return Math.max(0, (report.bytesBefore - report.bytesAfter) / report.bytesBefore);
}
