export interface TemplateContext {
  /** Number to show for `{n}` on this page. */
  readonly n: number;
  readonly total: number;
  /** Name of the output file. */
  readonly file: string;
  /** Day of export, as it should read. */
  readonly date: string;
}

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Roman numerals from 1 to 3999; anything else is written in digits. */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value);
  let rest = value;
  let out = '';
  for (const [size, letters] of ROMAN) {
    while (rest >= size) {
      out += letters;
      rest -= size;
    }
  }
  return out;
}

/** Fills the tokens of a template. Unknown tokens stay as typed, so a typo is visible. */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{(n|total|file|date)(?::(roman|ROMAN))?\}/g, (token, name, format) => {
    if (name === 'n') {
      if (format === 'roman') return toRoman(context.n).toLowerCase();
      return format === 'ROMAN' ? toRoman(context.n) : String(context.n);
    }
    if (format !== undefined) return token;
    return name === 'total' ? String(context.total) : name === 'file' ? context.file : context.date;
  });
}
