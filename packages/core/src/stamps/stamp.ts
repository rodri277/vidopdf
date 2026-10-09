import { parseRanges } from '../split/ranges';

/** Where on the page a stamp sits, as the reader sees the page (after any rotation). */
export type Anchor =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'middleLeft'
  | 'center'
  | 'middleRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';

export const ANCHORS: readonly Anchor[] = [
  'topLeft',
  'topCenter',
  'topRight',
  'middleLeft',
  'center',
  'middleRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
];

/** Which pages of the output a stamp goes on (1-based, as people count them). */
export type PageFilter =
  | { readonly kind: 'all' }
  | { readonly kind: 'odd' }
  | { readonly kind: 'even' }
  | { readonly kind: 'ranges'; readonly text: string };

interface StampBase {
  readonly id: string;
  readonly anchor: Anchor;
  /** Distance from the edges, in points (1/72 inch). Ignored on the centre lines. */
  readonly margin: number;
  /** 0 is invisible, 1 is solid. */
  readonly opacity: number;
  /** Degrees, counter-clockwise as the reader sees it. */
  readonly rotation: number;
  readonly pages: PageFilter;
  /** Leaves the first page of the output without it (a cover). */
  readonly skipFirst: boolean;
}

/**
 * Text with tokens: `{n}` the page number, `{n:roman}` or `{n:ROMAN}` the same in Roman numerals,
 * `{total}` the number of pages of the output, `{file}` the name of the output and `{date}`
 * the day of export.
 */
export interface TextStamp extends StampBase {
  readonly kind: 'text';
  readonly template: string;
  readonly fontSize: number;
  readonly bold: boolean;
  /** `#rrggbb`. */
  readonly color: string;
  /** What `{n}` shows on the first page of the output. */
  readonly startAt: number;
}

export interface ImageStamp extends StampBase {
  readonly kind: 'image';
  /** An image registered with the export worker. */
  readonly assetId: string;
  /** Width in points; the height keeps the picture's shape. */
  readonly width: number;
  /** Height divided by width of the picture. */
  readonly aspect: number;
}

export type Stamp = TextStamp | ImageStamp;

export const MIN_FONT_SIZE = 4;
export const MAX_FONT_SIZE = 400;
export const MAX_TEMPLATE_LENGTH = 300;
const COLOR = /^#[0-9a-f]{6}$/i;

export type StampProblem =
  | 'opacity'
  | 'rotation'
  | 'margin'
  | 'fontSize'
  | 'color'
  | 'template'
  | 'startAt'
  | 'size'
  | 'ranges';

function baseProblems(stamp: Stamp): StampProblem[] {
  const problems: StampProblem[] = [];
  if (!(stamp.opacity >= 0 && stamp.opacity <= 1)) problems.push('opacity');
  if (!Number.isFinite(stamp.rotation) || Math.abs(stamp.rotation) > 360) problems.push('rotation');
  if (!(stamp.margin >= 0 && stamp.margin <= 400)) problems.push('margin');
  // Ranges are checked against any page count: only their syntax can be wrong here.
  if (stamp.pages.kind === 'ranges' && !parseRanges(stamp.pages.text, 1_000_000).ok)
    problems.push('ranges');
  return problems;
}

function imageProblems(stamp: ImageStamp): StampProblem[] {
  return stamp.width > 0 && stamp.width <= 2000 && stamp.aspect > 0 ? [] : ['size'];
}

function textProblems(stamp: TextStamp): StampProblem[] {
  const problems: StampProblem[] = [];
  if (!(stamp.fontSize >= MIN_FONT_SIZE && stamp.fontSize <= MAX_FONT_SIZE))
    problems.push('fontSize');
  if (!COLOR.test(stamp.color)) problems.push('color');
  if (stamp.template.trim() === '' || stamp.template.length > MAX_TEMPLATE_LENGTH)
    problems.push('template');
  if (!Number.isInteger(stamp.startAt) || Math.abs(stamp.startAt) > 1_000_000)
    problems.push('startAt');
  return problems;
}

/** Everything wrong with a stamp as the form has it, so the UI can name each field. */
export function stampProblems(stamp: Stamp): StampProblem[] {
  return [
    ...baseProblems(stamp),
    ...(stamp.kind === 'image' ? imageProblems(stamp) : textProblems(stamp)),
  ];
}

const text = (
  id: string,
  template: string,
  changes: Partial<Omit<TextStamp, 'kind' | 'id' | 'template'>>,
): TextStamp => ({
  kind: 'text',
  id,
  template,
  anchor: 'bottomCenter',
  margin: 28,
  opacity: 1,
  rotation: 0,
  pages: { kind: 'all' },
  skipFirst: false,
  fontSize: 10,
  bold: false,
  color: '#333333',
  startAt: 1,
  ...changes,
});

/** The starting points the form offers; each is an ordinary stamp the user can then change. */
export const presets = {
  pageNumber: (id: string): TextStamp => text(id, '{n} / {total}', {}),
  header: (id: string): TextStamp =>
    text(id, '{file}', { anchor: 'topCenter', color: '#666666', fontSize: 9 }),
  footer: (id: string): TextStamp =>
    text(id, '{file}', { anchor: 'bottomLeft', color: '#666666', fontSize: 9 }),
  watermark: (id: string, label: string): TextStamp =>
    text(id, label, {
      anchor: 'center',
      fontSize: 72,
      bold: true,
      color: '#999999',
      opacity: 0.25,
      rotation: 45,
      margin: 0,
    }),
};
