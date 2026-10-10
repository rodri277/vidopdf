/** A value the user typed or chose in a form field. Checkboxes are booleans, lists are arrays. */
export type FormValue = string | boolean | readonly string[];

/** Field values by file, then by the field's full name. They follow the file, not the page. */
export type FormValues = Readonly<Record<string, Readonly<Record<string, FormValue>>>>;

export type FormMode = 'keep' | 'flatten';

export type FormFieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list';

/** A field of a file's form, as the interface needs it to offer a way to fill it. */
export interface FormFieldInfo {
  /** The full name: how values are keyed. */
  readonly name: string;
  readonly kind: FormFieldKind;
  /** What the file has in it now. */
  readonly value: FormValue;
  /** The choices of a radio group, a dropdown or a list. */
  readonly options: readonly string[];
  readonly readOnly: boolean;
  readonly multiline: boolean;
}

export interface FormInfo {
  readonly fields: readonly FormFieldInfo[];
  /** The file also carries an XFA form, which is not supported and is not carried over. */
  readonly hasXfa: boolean;
  /** Fields of a kind this version cannot fill (buttons, signatures). */
  readonly skipped: number;
}
