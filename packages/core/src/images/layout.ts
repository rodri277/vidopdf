/** Where an image goes on its PDF page. All sizes are PDF points (1/72 inch). */
export type PaperChoice = 'fit' | 'a4' | 'letter' | 'custom';
export type OrientationChoice = 'auto' | 'portrait' | 'landscape';
export type MarginChoice = 'none' | 'small' | 'large';

/** A page size typed by the user, in points. */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** PDF viewers are only specified up to 14 400 units (200 inches) on a side; very small is useless. */
export const MIN_PAGE_POINTS = 14;
export const MAX_PAGE_POINTS = 14_400;

export type PageSizeProblem = 'invalid' | 'tooSmall' | 'tooLarge';

/** What is wrong with a typed page size, or nothing. */
export function pageSizeProblem(size: PageSize): PageSizeProblem | undefined {
  const sides = [size.width, size.height];
  if (sides.some((side) => !Number.isFinite(side) || side <= 0)) return 'invalid';
  if (sides.some((side) => side < MIN_PAGE_POINTS)) return 'tooSmall';
  return sides.some((side) => side > MAX_PAGE_POINTS) ? 'tooLarge' : undefined;
}

export interface ImagePageOptions {
  readonly paper: PaperChoice;
  /** The page of `paper: 'custom'`; the other choices ignore it. */
  readonly custom: PageSize;
  readonly orientation: OrientationChoice;
  readonly margin: MarginChoice;
}

export const defaultImagePageOptions: ImagePageOptions = {
  paper: 'a4',
  custom: { width: 595, height: 842 },
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

const PAPER_POINTS: Record<'a4' | 'letter', PageSize> = {
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

const clampSide = (side: number): number =>
  Number.isFinite(side)
    ? Math.min(MAX_PAGE_POINTS, Math.max(MIN_PAGE_POINTS, side))
    : MIN_PAGE_POINTS;

function paperSize(
  imageWidth: number,
  imageHeight: number,
  options: ImagePageOptions,
): PageSize | undefined {
  if (options.paper === 'fit') return undefined;
  // A page typed by the user is used as typed: its orientation is the one that was written.
  if (options.paper === 'custom')
    return { width: clampSide(options.custom.width), height: clampSide(options.custom.height) };
  const paper = PAPER_POINTS[options.paper];
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
  // A very small page of the user's own keeps room for the picture: margins take at most a quarter.
  const gap = Math.min(margin, Math.min(paper.width, paper.height) / 4);
  const boxWidth = Math.max(1, paper.width - 2 * gap);
  const boxHeight = Math.max(1, paper.height - 2 * gap);
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

/**
 * Resolution the picture gets on its page, in pixels per inch. Below about 150 it starts to look
 * soft when printed; the dialog says so before the page is made.
 */
export function effectiveDpi(imageWidth: number, placement: ImagePlacement): number {
  return placement.width > 0 ? imageWidth / (placement.width / 72) : 0;
}

/** Below this a printed picture looks visibly pixelated. */
export const LOW_DPI = 100;
