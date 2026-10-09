import { MAX_CANVAS_PIXELS } from '../limits';
import { paddedNumber, safeFileName } from '../names';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export const IMAGE_FORMATS: readonly ImageFormat[] = ['png', 'jpeg', 'webp'];
export const DPI_MIN = 72;
export const DPI_MAX = 300;
export const DEFAULT_DPI = 150;
export const DEFAULT_QUALITY = 0.9;

export interface ImageExportOptions {
  readonly format: ImageFormat;
  readonly dpi: number;
  /** 0.5 to 1; only JPEG and WebP use it (PNG is lossless). */
  readonly quality: number;
}

export const defaultImageExportOptions: ImageExportOptions = {
  format: 'png',
  dpi: DEFAULT_DPI,
  quality: DEFAULT_QUALITY,
};

export function clampDpi(dpi: number): number {
  return Number.isFinite(dpi) ? Math.min(DPI_MAX, Math.max(DPI_MIN, Math.round(dpi))) : DEFAULT_DPI;
}

export function clampQuality(quality: number): number {
  return Number.isFinite(quality) ? Math.min(1, Math.max(0.5, quality)) : DEFAULT_QUALITY;
}

export function imageMime(format: ImageFormat): string {
  return `image/${format}`;
}

export function imageExtension(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** Pixels a page of this size (in points) takes at this resolution. */
export function pixelSize(widthPoints: number, heightPoints: number, dpi: number): PixelSize {
  const scale = clampDpi(dpi) / 72;
  return {
    width: Math.max(1, Math.round(widthPoints * scale)),
    height: Math.max(1, Math.round(heightPoints * scale)),
  };
}

export interface FittedResolution extends PixelSize {
  /** The resolution actually used: lower than asked when the page would not fit the pixel budget. */
  readonly dpi: number;
  readonly capped: boolean;
}

/** Lowers the resolution of a very large page so its picture stays within the canvas budget. */
export function fitResolution(
  widthPoints: number,
  heightPoints: number,
  dpi: number,
  maxPixels = MAX_CANVAS_PIXELS,
): FittedResolution {
  const wanted = clampDpi(dpi);
  const full = pixelSize(widthPoints, heightPoints, wanted);
  if (full.width * full.height <= maxPixels) return { ...full, dpi: wanted, capped: false };
  const squeeze = Math.sqrt(maxPixels / (full.width * full.height));
  const fitted = wanted * squeeze;
  const size = {
    width: Math.max(1, Math.floor(full.width * squeeze)),
    height: Math.max(1, Math.floor(full.height * squeeze)),
  };
  return { ...size, dpi: fitted, capped: true };
}

/** "report-007.png": the page number is padded to the width the document needs. */
export function imageFileName(
  base: string,
  pageNumber: number,
  pageCount: number,
  format: ImageFormat,
): string {
  const stem = safeFileName(base, 'page');
  return `${stem}-${paddedNumber(pageNumber, pageCount)}.${imageExtension(format)}`;
}
