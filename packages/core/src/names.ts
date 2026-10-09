const MAX_NAME_LENGTH = 120;

// eslint-disable-next-line no-control-regex -- control characters are exactly what we remove
const FORBIDDEN = /[\u0000-\u001f<>:"/\\|?*]+/g;

/** Strips path separators and control characters so a name can never escape the target folder. */
export function safeFileName(name: string, fallback = 'document'): string {
  const cleaned = name.replace(FORBIDDEN, '_').trim().replace(/^\.+/, '').trim();
  return cleaned === '' ? fallback : cleaned.slice(0, MAX_NAME_LENGTH);
}

/** "report.final.pdf" becomes "report.final". Names with no extension are returned as they are. */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 1-based number padded to the width the total needs: (3, 120) gives "003". */
export function paddedNumber(number: number, total: number): string {
  return String(number).padStart(String(Math.max(1, total)).length, '0');
}

/**
 * Makes every name unique, case-insensitively (Windows and macOS do not tell "A.pdf" from
 * "a.pdf"), by adding " (2)", " (3)"... before the extension. Order is kept.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let candidate = name;
    for (let copy = 2; used.has(candidate.toLowerCase()); copy++) {
      candidate = `${stem} (${String(copy)})${extension}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
