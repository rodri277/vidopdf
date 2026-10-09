/** A value the user typed or chose in a form field. Checkboxes are booleans, lists are arrays. */
export type FormValue = string | boolean | readonly string[];

/** Field values by file, then by the field's full name. They follow the file, not the page. */
export type FormValues = Readonly<Record<string, Readonly<Record<string, FormValue>>>>;

export type FormMode = 'keep' | 'flatten';
