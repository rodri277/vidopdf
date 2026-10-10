import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFObjectCopier,
  PDFRef,
  PDFString,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  StandardFonts,
} from '@cantoo/pdf-lib';
import type { PDFDocument, PDFField, PDFObject, PDFPage } from '@cantoo/pdf-lib';
import { pdfError } from '@vidopdf/core';
import type { Decorations, FormValue, PdfError } from '@vidopdf/core';

/** A page of a source as it was copied into the output. */
export interface PlacedPage {
  readonly sourceId: string;
  readonly page: PDFPage;
}

/** Where a field of the output came from, so values typed for a file reach the right field. */
export interface FieldOrigin {
  readonly sourceId: string;
  readonly original: string;
  readonly renamed: string;
}

const WIDGET = PDFName.of('Widget');

function textOf(object: PDFObject | undefined): string | undefined {
  return object instanceof PDFString || object instanceof PDFHexString
    ? object.decodeText()
    : undefined;
}

/** The widget annotations of a page, as references. */
function widgetsOf(page: PDFPage, doc: PDFDocument): PDFRef[] {
  const annots = page.node.Annots();
  if (annots === undefined) return [];
  const widgets: PDFRef[] = [];
  for (let index = 0; index < annots.size(); index++) {
    const ref = annots.get(index);
    if (!(ref instanceof PDFRef)) continue;
    const dict = doc.context.lookupMaybe(ref, PDFDict);
    if (dict?.get(PDFName.of('Subtype')) === WIDGET) widgets.push(ref);
  }
  return widgets;
}

/** The field at the top of the tree a widget belongs to (the widget itself if it has no parent). */
function topOf(ref: PDFRef, doc: PDFDocument): { ref: PDFRef; dict: PDFDict } | undefined {
  let current = ref;
  let dict = doc.context.lookupMaybe(current, PDFDict);
  while (dict !== undefined) {
    const parent = dict.get(PDFName.of('Parent'));
    if (!(parent instanceof PDFRef)) return { ref: current, dict };
    current = parent;
    dict = doc.context.lookupMaybe(current, PDFDict);
  }
  return undefined;
}

const unique = (name: string, used: Set<string>): string => {
  let candidate = name;
  for (let suffix = 2; used.has(candidate); suffix++) candidate = `${name}_${String(suffix)}`;
  return candidate;
};

/** Takes `/DR` (the fonts fields draw with) and `/DA` from the first source that has them. */
function acroFormDefaults(
  output: PDFDocument,
  sources: ReadonlyMap<string, PDFDocument>,
  used: ReadonlySet<string>,
): PDFDict {
  const dict = output.context.obj({});
  for (const sourceId of used) {
    const source = sources.get(sourceId);
    const acro = source?.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
    if (source === undefined || acro === undefined) continue;
    const copier = PDFObjectCopier.for(source.context, output.context);
    for (const key of ['DR', 'DA', 'Q']) {
      const value = acro.get(PDFName.of(key));
      if (value !== undefined && !dict.has(PDFName.of(key)))
        dict.set(PDFName.of(key), copier.copy(value));
    }
  }
  return dict;
}

/**
 * Copying pages brings the widgets but not the form they belong to, so the output has no fields.
 * This builds the form again from the widgets that were copied (ADR 006), so a merged file keeps
 * fillable fields. Two files can both have a field called "name": the second is renamed, so the
 * fields stay apart instead of silently sharing a value. XFA data is not carried (it is
 * unsupported); the AcroForm fields are.
 */
export function rebuildForms(
  output: PDFDocument,
  sources: ReadonlyMap<string, PDFDocument>,
  placed: readonly PlacedPage[],
): FieldOrigin[] {
  const fields = PDFArray.withContext(output.context);
  const seen = new Set<PDFRef>();
  const names = new Set<string>();
  const origins: FieldOrigin[] = [];
  const contributing = new Set<string>();
  for (const { sourceId, page } of placed) {
    for (const widget of widgetsOf(page, output)) {
      const top = topOf(widget, output);
      if (top === undefined || seen.has(top.ref)) continue;
      seen.add(top.ref);
      const original = textOf(top.dict.get(PDFName.of('T'))) ?? '';
      const renamed = unique(original, names);
      names.add(renamed);
      if (renamed !== original) top.dict.set(PDFName.of('T'), PDFHexString.fromText(renamed));
      origins.push({ sourceId, original, renamed });
      contributing.add(sourceId);
      fields.push(top.ref);
    }
  }
  if (fields.size() === 0) return [];
  const acro = acroFormDefaults(output, sources, contributing);
  acro.set(PDFName.of('Fields'), fields);
  output.catalog.set(PDFName.of('AcroForm'), output.context.register(acro));
  return origins;
}

/** Characters the standard form font (WinAnsi) can show, beyond the plain Latin-1 ranges. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

function inWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    code === 0x0a ||
    code === 0x0d ||
    code === 0x09 ||
    WIN_ANSI_EXTRA.has(char)
  );
}

function fillText(field: PDFTextField, value: FormValue): PdfError | undefined {
  if (typeof value !== 'string') return undefined;
  const bad = new Set<string>();
  for (const char of value) if (!inWinAnsi(char)) bad.add(char);
  if (bad.size > 0) {
    return pdfError('unsupported', `characters a form field cannot hold: ${[...bad].join(' ')}`);
  }
  field.setText(value);
  return undefined;
}

function fillChoice(field: PDFRadioGroup | PDFDropdown | PDFOptionList, value: FormValue): void {
  const options = field.getOptions();
  if (field instanceof PDFOptionList) {
    if (Array.isArray(value))
      field.select((value as readonly string[]).filter((o) => options.includes(o)));
  } else if (typeof value === 'string' && options.includes(value)) {
    field.select(value);
  }
}

function fillOne(field: PDFField, value: FormValue): PdfError | undefined {
  if (field instanceof PDFTextField) return fillText(field, value);
  if (field instanceof PDFCheckBox) {
    if (value === true) field.check();
    else if (value === false) field.uncheck();
  } else if (
    field instanceof PDFRadioGroup ||
    field instanceof PDFDropdown ||
    field instanceof PDFOptionList
  ) {
    fillChoice(field, value);
  }
  return undefined;
}

/** Writes the values typed for each file into its fields and optionally flattens the form. */
export async function applyForms(
  output: PDFDocument,
  origins: readonly FieldOrigin[],
  deco: Pick<Decorations, 'forms' | 'formMode'>,
): Promise<PdfError | undefined> {
  if (origins.length === 0) return undefined;
  const form = output.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    const origin = origins.find(
      (candidate) => name === candidate.renamed || name.startsWith(`${candidate.renamed}.`),
    );
    if (origin === undefined) continue;
    const qualified = `${origin.original}${name.slice(origin.renamed.length)}`;
    const value = deco.forms[origin.sourceId]?.[qualified];
    if (value === undefined) continue;
    const failure = fillOne(field, value);
    if (failure !== undefined) return failure;
  }
  const font = await output.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);
  if (deco.formMode === 'flatten') {
    form.flatten();
    // Flattening empties the list of fields but leaves the form dictionary behind.
    output.catalog.delete(PDFName.of('AcroForm'));
  }
  return undefined;
}
