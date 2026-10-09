import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Test helper: reopens a PDF with pdf.js and returns the text and size of each page. */
export async function readPages(
  bytes: Uint8Array,
): Promise<readonly { text: string; width: number; height: number; rotate: number }[]> {
  const task = getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join('');
    const [x0, y0, x1, y1] = page.view as [number, number, number, number];
    pages.push({ text, width: x1 - x0, height: y1 - y0, rotate: page.rotate });
  }
  await task.destroy();
  return pages;
}
