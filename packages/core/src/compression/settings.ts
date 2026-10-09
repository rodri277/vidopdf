import type { CompressionPreset } from '../ports';

/** What a preset asks of the pictures in a PDF. */
export interface CompressionSettings {
  /** No picture is kept sharper than this when drawn on the page (dots per inch). */
  readonly targetDpi: number;
  /** JPEG quality, 0 to 1, for every picture that is encoded again. */
  readonly jpegQuality: number;
}

export const COMPRESSION_PRESETS: readonly CompressionPreset[] = ['screen', 'balanced', 'print'];

const SETTINGS: Record<CompressionPreset, CompressionSettings> = {
  // For reading on a screen or sending by e-mail: the smallest file that still looks right.
  screen: { targetDpi: 96, jpegQuality: 0.55 },
  // The default: about what a phone or a laptop shows, hard to tell from the original.
  balanced: { targetDpi: 150, jpegQuality: 0.72 },
  // Keeps enough detail for a good home or office printer.
  print: { targetDpi: 220, jpegQuality: 0.85 },
};

export function settingsFor(preset: CompressionPreset): CompressionSettings {
  return SETTINGS[preset];
}
