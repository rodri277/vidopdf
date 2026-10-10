import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from '@cantoo/pdf-lib';
import type { PDFField } from '@cantoo/pdf-lib';
import { err, ok, pdfError } from '@vidopdf/core';
import type { FormFieldInfo, FormInfo, PdfError, Result } from '@vidopdf/core';

function describe(field: PDFField): FormFieldInfo | undefined {
  const base = { name: field.getName(), readOnly: field.isReadOnly() };
  if (field instanceof PDFTextField) {
    return {
      ...base,
      kind: 'text',
      value: field.getText() ?? '',
      options: [],
      multiline: field.isMultiline(),
    };
  }
  if (field instanceof PDFCheckBox) {
    return { ...base, kind: 'checkbox', value: field.isChecked(), options: [], multiline: false };
  }
  if (field instanceof PDFRadioGroup) {
    return {
      ...base,
      kind: 'radio',
      value: field.getSelected() ?? '',
      options: field.getOptions(),
      multiline: false,
    };
  }
  if (field instanceof PDFDropdown) {
    return {
      ...base,
      kind: 'dropdown',
      value: field.getSelected()[0] ?? '',
      options: field.getOptions(),
      multiline: false,
    };
  }
  if (field instanceof PDFOptionList) {
    return {
      ...base,
      kind: 'list',
      value: field.getSelected(),
      options: field.getOptions(),
      multiline: false,
    };
  }
  return undefined;
}

/** The fields of a file's form that can be filled, and whether it carries XFA data. */
export async function readFormInfo(
  bytes: Uint8Array,
  password?: string,
): Promise<Result<FormInfo, PdfError>> {
  try {
    const doc = await PDFDocument.load(bytes, {
      updateMetadata: false,
      ...(password === undefined ? {} : { password }),
    });
    const form = doc.getForm();
    const all = form.getFields();
    const fields = all.flatMap((field) => describe(field) ?? []);
    return ok({ fields, hasXfa: form.hasXFA(), skipped: all.length - fields.length });
  } catch (error) {
    return err(pdfError('corrupt', error instanceof Error ? error.message : String(error)));
  }
}
