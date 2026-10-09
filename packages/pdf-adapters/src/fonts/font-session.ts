import { degrees, rgb } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFFont, PDFPage } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { woffToSfnt } from './woff';

/** One file of a font family: a script at a weight. Loaded only when a character needs it. */
export interface FontFile {
  readonly script: string;
  readonly bold: boolean;
  /** The WOFF 1 bytes. */
  readonly load: () => Promise<Uint8Array>;
}

interface Kit {
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(text: string): { advanceWidth: number };
  ascent: number;
  descent: number;
  unitsPerEm: number;
}

interface LoadedFont {
  readonly sfnt: Uint8Array;
  readonly kit: Kit;
  embedded?: PDFFont;
}

/** A piece of text set in one font, with its width at a size. */
export interface Run {
  readonly text: string;
  readonly font: LoadedFont;
}

export interface Laid {
  readonly runs: readonly Run[];
  /** Characters no file of the family has. */
  readonly unsupported: readonly string[];
}

export interface TextMetrics {
  readonly width: number;
  /** Line height (ascent plus descent) and the depth of the descent, both at the size asked. */
  readonly height: number;
  readonly descent: number;
}

export interface DrawStyle {
  /** Bottom-left corner of the line's box. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** Counter-clockwise, in the page's stored coordinates. */
  readonly angle: number;
  readonly color: string;
  readonly opacity: number;
}

const hex = (color: string): ReturnType<typeof rgb> => {
  const value = Number.parseInt(color.slice(1), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
};

/**
 * Text beyond Latin-1 for one document: picks, character by character, the first file of the
 * family that has the glyph (the per-script files of Inter lack each other's digits and
 * punctuation), embeds a file the first time it is drawn, and sets the text in runs.
 */
export class FontSession {
  readonly #loaded = new Map<FontFile, Promise<LoadedFont>>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly files: readonly FontFile[],
  ) {
    doc.registerFontkit(fontkit);
  }

  #load(file: FontFile): Promise<LoadedFont> {
    let promise = this.#loaded.get(file);
    if (promise === undefined) {
      promise = file.load().then((woff) => {
        const sfnt = woffToSfnt(woff);
        return { sfnt, kit: fontkit.create(sfnt) as unknown as Kit };
      });
      this.#loaded.set(file, promise);
    }
    return promise;
  }

  /** Splits text into runs. Files are tried in the order given and loaded only if needed. */
  async layout(text: string, bold: boolean): Promise<Laid> {
    const candidates = this.files.filter((file) => file.bold === bold);
    const runs: { text: string; font: LoadedFont }[] = [];
    const unsupported: string[] = [];
    for (const char of text.replace(/[\r\n\t]+/g, ' ')) {
      const font = await this.#fontFor(char.codePointAt(0) ?? 0, candidates);
      if (font === undefined) {
        unsupported.push(char);
        continue;
      }
      const last = runs.at(-1);
      if (last?.font === font) last.text += char;
      else runs.push({ text: char, font });
    }
    return { runs, unsupported };
  }

  async #fontFor(
    codePoint: number,
    candidates: readonly FontFile[],
  ): Promise<LoadedFont | undefined> {
    for (const file of candidates) {
      const font = await this.#load(file);
      if (font.kit.hasGlyphForCodePoint(codePoint)) return font;
    }
    return undefined;
  }

  metrics(laid: Laid, size: number): TextMetrics {
    const width = laid.runs.reduce(
      (total, run) =>
        total + (run.font.kit.layout(run.text).advanceWidth * size) / run.font.kit.unitsPerEm,
      0,
    );
    const reference = laid.runs[0]?.font.kit;
    const ascent = reference === undefined ? 0.8 : reference.ascent / reference.unitsPerEm;
    const descent = reference === undefined ? 0.2 : -reference.descent / reference.unitsPerEm;
    return { width, height: (ascent + descent) * size, descent: descent * size };
  }

  async #embedded(font: LoadedFont): Promise<PDFFont> {
    // Subsetting fails on these files (ADR 006), so the whole file is embedded, once per document.
    font.embedded ??= await this.doc.embedFont(font.sfnt, { subset: false });
    return font.embedded;
  }

  /** Draws the runs one after another along the baseline of a (possibly turned) line. */
  async draw(page: PDFPage, laid: Laid, metrics: TextMetrics, style: DrawStyle): Promise<void> {
    const radians = (style.angle * Math.PI) / 180;
    const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
    // The box origin is its bottom-left corner; the baseline sits one descent above it.
    let x = style.x - metrics.descent * sin;
    let y = style.y + metrics.descent * cos;
    for (const run of laid.runs) {
      const width =
        (run.font.kit.layout(run.text).advanceWidth * style.size) / run.font.kit.unitsPerEm;
      page.drawText(run.text, {
        x,
        y,
        size: style.size,
        font: await this.#embedded(run.font),
        color: hex(style.color),
        opacity: style.opacity,
        rotate: degrees(style.angle),
      });
      x += width * cos;
      y += width * sin;
    }
  }
}
