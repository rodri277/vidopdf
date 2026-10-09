/** Where an image goes on its PDF page. All sizes are PDF points (1/72 inch). */
export type PaperChoice = 'fit' | 'a4' | 'letter';
export type OrientationChoice = 'auto' | 'portrait' | 'landscape';
export type MarginChoice = 'none' | 'small' | 'large';

export interface ImagePageOptions {
  readonly paper: PaperChoice;
  readonly orientation: OrientationChoice;
  readonly margin: MarginChoice;
}

export const defaultImagePageOptions: ImagePageOptions = {
  paper: 'a4',
  orientation: 'auto',
  margin: 'small',
};

export interface ImagePlacement {
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** Lower-left corner of the picture, as PDF coordinates want it. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const MARGIN_POINTS: Record<MarginChoice, number> = { none: 0, small: 18, large: 36 };

const PAPER_POINTS: Record<'a4' | 'letter', { width: number; height: number }> = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
};

/** "Fit" gives a page the size the picture has at 96 dpi, shrunk if its long side passes A3's. */
const PIXEL_TO_POINT = 0.75;
const FIT_LONG_SIDE = 1190;

function naturalSize(imageWidth: number, imageHeight: number): { width: number; height: number } {
  const width = imageWidth * PIXEL_TO_POINT;
  const height = imageHeight * PIXEL_TO_POINT;
  const shrink = Math.min(1, FIT_LONG_SIDE / Math.max(width, height));
  return { width: width * shrink, height: height * shrink };
}

function paperSize(imageWidth: number, imageHeight: number, options: ImagePageOptions) {
  const paper = options.paper === 'fit' ? undefined : PAPER_POINTS[options.paper];
  if (paper === undefined) return undefined;
  const landscape =
    options.orientation === 'landscape' ||
    (options.orientation === 'auto' && imageWidth > imageHeight);
  return landscape ? { width: paper.height, height: paper.width } : paper;
}

/**
 * Page size and picture position for one image. On paper the picture is scaled (up or down) to
 * the largest size that fits inside the margins, keeping its proportions, and centred. With
 * "fit" the page takes the picture's own size plus the margins.
 */
export function placeImage(
  imageWidth: number,
  imageHeight: number,
  options: ImagePageOptions,
): ImagePlacement {
  const w = Math.max(1, imageWidth);
  const h = Math.max(1, imageHeight);
  const margin = MARGIN_POINTS[options.margin];
  const paper = paperSize(w, h, options);
  if (paper === undefined) {
    const natural = naturalSize(w, h);
    return {
      pageWidth: natural.width + 2 * margin,
      pageHeight: natural.height + 2 * margin,
      x: margin,
      y: margin,
      width: natural.width,
      height: natural.height,
    };
  }
  const boxWidth = Math.max(1, paper.width - 2 * margin);
  const boxHeight = Math.max(1, paper.height - 2 * margin);
  const scale = Math.min(boxWidth / w, boxHeight / h);
  const width = w * scale;
  const height = h * scale;
  return {
    pageWidth: paper.width,
    pageHeight: paper.height,
    x: (paper.width - width) / 2,
    y: (paper.height - height) / 2,
    width,
    height,
  };
}
