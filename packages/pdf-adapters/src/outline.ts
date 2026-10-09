import { err, ok, pdfError } from '@vidopdf/core';
import type { OutlineEntry, PdfError, Result } from '@vidopdf/core';

/** The part of a pdf.js document the outline reader needs; the real document satisfies it. */
export interface OutlineSource {
  getOutline(): Promise<readonly OutlineNode[] | null>;
  getDestination(id: string): Promise<readonly unknown[] | null>;
  getPageIndex(ref: { num: number; gen: number }): Promise<number>;
}

export interface OutlineNode {
  readonly title: string;
  readonly dest: unknown;
  readonly items?: readonly OutlineNode[] | undefined;
}

/** Hostile files can nest bookmarks absurdly deep or have millions of them. */
const MAX_DEPTH = 32;
const MAX_ENTRIES = 10_000;

function isPageRef(value: unknown): value is { num: number; gen: number } {
  return typeof value === 'object' && value !== null && 'num' in value && 'gen' in value;
}

/** Where a bookmark points: a page index, or undefined when it leads nowhere usable. */
async function targetPage(source: OutlineSource, dest: unknown): Promise<number | undefined> {
  const explicit = typeof dest === 'string' ? await source.getDestination(dest) : dest;
  if (!Array.isArray(explicit)) return undefined;
  const [target] = explicit as unknown[];
  if (typeof target === 'number')
    return Number.isInteger(target) && target >= 0 ? target : undefined;
  return isPageRef(target) ? source.getPageIndex(target) : undefined;
}

/**
 * The bookmarks of a document, flattened in reading order with their level (1 at the top).
 * Entries that point nowhere (no destination, a page that does not exist) are skipped, never fatal.
 */
export async function readOutline(
  source: OutlineSource,
): Promise<Result<OutlineEntry[], PdfError>> {
  try {
    const entries: OutlineEntry[] = [];
    const walk = async (nodes: readonly OutlineNode[], level: number): Promise<void> => {
      for (const node of nodes) {
        if (entries.length >= MAX_ENTRIES) return;
        const pageIndex = await targetPage(source, node.dest).catch(() => undefined);
        if (pageIndex !== undefined) entries.push({ title: node.title, pageIndex, level });
        if (node.items !== undefined && level < MAX_DEPTH) await walk(node.items, level + 1);
      }
    };
    await walk((await source.getOutline()) ?? [], 1);
    return ok(entries);
  } catch (error) {
    return err(pdfError('corrupt', error instanceof Error ? error.message : String(error)));
  }
}
