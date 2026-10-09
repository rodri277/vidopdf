import type { Matrix } from '../images/orientation';

/**
 * A reader for the part of a page's content stream that says where pictures are drawn: it follows
 * the graphics state (`q`, `Q`, `cm`) and reports every `Do` with the matrix in force. Everything
 * else (text, paths, colours) is skipped over. Pure, so it is tested without a PDF.
 */

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `outer` applied after `inner` (PDF row-vector convention): what `cm` does to the current matrix. */
export function multiply(inner: Matrix, outer: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = inner;
  const [a2, b2, c2, d2, e2, f2] = outer;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

export interface DrawnObject {
  /** The name in the page's /XObject resources. */
  readonly name: string;
  /** Matrix mapping the unit square (the picture) onto the page, in points. */
  readonly matrix: Matrix;
}

/** Size in points that a picture drawn with this matrix covers. */
export function drawnSize(matrix: Matrix): { width: number; height: number } {
  const [a, b, c, d] = matrix;
  return { width: Math.hypot(a, b), height: Math.hypot(c, d) };
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

type Token =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'name'; readonly value: string }
  | { readonly kind: 'operator'; readonly value: string }
  | { readonly kind: 'other' };

class Lexer {
  position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.position >= this.bytes.length;
  }

  private at(offset = 0): number {
    return this.bytes[this.position + offset] ?? -1;
  }

  private skipSpace(): void {
    while (!this.done) {
      const byte = this.at();
      if (WHITESPACE.has(byte)) this.position++;
      else if (byte === 0x25) this.skipComment();
      else return;
    }
  }

  private skipComment(): void {
    while (!this.done && this.at() !== 0x0a && this.at() !== 0x0d) this.position++;
  }

  /** `( ... )` with nested parentheses and backslash escapes. */
  private skipString(): void {
    let depth = 0;
    while (!this.done) {
      const byte = this.at();
      this.position++;
      if (byte === 0x5c) this.position++;
      else if (byte === 0x28) depth++;
      else if (byte === 0x29 && --depth === 0) return;
    }
  }

  private word(): string {
    const start = this.position;
    while (!this.done && !WHITESPACE.has(this.at()) && !DELIMITERS.has(this.at())) this.position++;
    return String.fromCharCode(...this.bytes.subarray(start, this.position));
  }

  /** After `ID`: the picture data runs to a whitespace, `EI`, whitespace sequence. */
  skipInlineImage(): void {
    while (!this.done) {
      const isEnd =
        this.at() === 0x45 &&
        this.at(1) === 0x49 &&
        WHITESPACE.has(this.at(-1)) &&
        (WHITESPACE.has(this.at(2)) || this.at(2) === -1);
      this.position++;
      if (isEnd) {
        this.position++;
        return;
      }
    }
  }

  /** `< ... >` hexadecimal string. */
  private skipHex(): void {
    while (!this.done && this.at() !== 0x3e) this.position++;
    this.position++;
  }

  /** Any other delimiter: `<<` and `>>` are two bytes, the rest one. */
  private skipDelimiter(byte: number): void {
    this.position += byte === 0x3c || byte === 0x3e ? 2 : 1;
  }

  /** A number, or an operator such as `cm`. */
  private bareWord(): Token {
    const word = this.word();
    const number = Number(word);
    return word !== '' && Number.isFinite(number)
      ? { kind: 'number', value: number }
      : { kind: 'operator', value: word };
  }

  next(): Token | undefined {
    this.skipSpace();
    if (this.done) return undefined;
    const byte = this.at();
    if (byte === 0x2f) {
      this.position++;
      return { kind: 'name', value: this.word() };
    }
    if (byte === 0x28) this.skipString();
    else if (byte === 0x3c && this.at(1) !== 0x3c) this.skipHex();
    else if (DELIMITERS.has(byte)) this.skipDelimiter(byte);
    else return this.bareWord();
    return { kind: 'other' };
  }

  /** From just after `BI`: skips the dictionary, then the data. */
  skipInlinePicture(): void {
    for (let token = this.next(); token !== undefined; token = this.next()) {
      if (token.kind === 'operator' && token.value === 'ID') break;
    }
    this.position++;
    this.skipInlineImage();
  }
}

const isMatrix = (
  values: readonly number[],
): values is [number, number, number, number, number, number] => values.length === 6;

/** The graphics state that matters here: the current matrix and the ones saved with `q`. */
class Placement {
  private readonly saved: Matrix[] = [];

  constructor(public current: Matrix) {}

  apply(operator: string, operands: readonly number[]): void {
    if (operator === 'q') this.saved.push(this.current);
    else if (operator === 'Q') this.current = this.saved.pop() ?? this.current;
    else if (operator === 'cm') {
      const matrix = operands.slice(-6);
      if (isMatrix(matrix)) this.current = multiply(matrix, this.current);
    }
  }
}

/**
 * Every `Do` of a content stream, in order, with the matrix in force at that point. `start` is the
 * matrix already in force when the stream begins (the page's own, or a form's).
 */
export function drawnObjects(content: Uint8Array, start: Matrix = IDENTITY): DrawnObject[] {
  const lexer = new Lexer(content);
  const found: DrawnObject[] = [];
  const state = new Placement(start);
  let numbers: number[] = [];
  let lastName: string | undefined;

  for (let token = lexer.next(); token !== undefined; token = lexer.next()) {
    if (token.kind === 'number') numbers.push(token.value);
    else if (token.kind === 'name') lastName = token.value;
    else if (token.kind === 'operator') {
      if (token.value === 'Do' && lastName !== undefined)
        found.push({ name: lastName, matrix: state.current });
      else if (token.value === 'BI') lexer.skipInlinePicture();
      else state.apply(token.value, numbers);
      numbers = [];
      lastName = undefined;
    }
  }
  return found;
}
