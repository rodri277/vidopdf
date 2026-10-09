import { PDFHexString, PDFName } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFRef } from '@cantoo/pdf-lib';
import type { ResolvedBookmark } from '@vidopdf/core';

function descendants(nodes: readonly ResolvedBookmark[]): number {
  return nodes.reduce((total, node) => total + 1 + descendants(node.children), 0);
}

/**
 * Writes the bookmarks of the document (pdf-lib has no outline API). Titles are Unicode text
 * strings and every item opens its page fitted in the window.
 */
export function writeOutline(doc: PDFDocument, bookmarks: readonly ResolvedBookmark[]): void {
  if (bookmarks.length === 0) return;
  const context = doc.context;
  const pages = doc.getPages();
  const root = context.nextRef();

  const build = (list: readonly ResolvedBookmark[], parent: PDFRef): PDFRef[] => {
    const refs = list.map(() => context.nextRef());
    list.forEach((item, index) => {
      const target = pages[item.pageIndex]?.ref;
      const dict = context.obj({
        Title: PDFHexString.fromText(item.title),
        Parent: parent,
      });
      if (target !== undefined)
        dict.set(PDFName.of('Dest'), context.obj([target, PDFName.of('Fit')]));
      const previous = refs[index - 1];
      const next = refs[index + 1];
      if (previous !== undefined) dict.set(PDFName.of('Prev'), previous);
      if (next !== undefined) dict.set(PDFName.of('Next'), next);
      const own = refs[index];
      if (item.children.length > 0 && own !== undefined) {
        const kids = build(item.children, own);
        const [first, last] = [kids[0], kids.at(-1)];
        if (first !== undefined && last !== undefined) {
          dict.set(PDFName.of('First'), first);
          dict.set(PDFName.of('Last'), last);
          dict.set(PDFName.of('Count'), context.obj(descendants(item.children)));
        }
      }
      if (own !== undefined) context.assign(own, dict);
    });
    return refs;
  };

  const top = build(bookmarks, root);
  const [first, last] = [top[0], top.at(-1)];
  if (first === undefined || last === undefined) return;
  context.assign(
    root,
    context.obj({ Type: 'Outlines', First: first, Last: last, Count: descendants(bookmarks) }),
  );
  doc.catalog.set(PDFName.of('Outlines'), root);
}
