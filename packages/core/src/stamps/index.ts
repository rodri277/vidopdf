export {
  ANCHORS,
  MAX_FONT_SIZE,
  MAX_TEMPLATE_LENGTH,
  MIN_FONT_SIZE,
  presets,
  stampProblems,
} from './stamp';
export type { Anchor, ImageStamp, PageFilter, Stamp, StampProblem, TextStamp } from './stamp';
export { renderTemplate, toRoman } from './template';
export type { TemplateContext } from './template';
export { stampAppliesTo, stampsFor } from './select';
export { anchoredBox, displaySize, displayToPdf, placeStamp, toPdfPlacement } from './placement';
export type { PdfPlacement, Placement, Point, Size } from './placement';
