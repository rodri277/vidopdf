// Generates the code-made PDFs in tests/fixtures/generated. Output is deterministic (fixed dates),
// so rerunning it leaves git clean. Provenance: tests/fixtures/README.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/generated');
mkdirSync(outDir, { recursive: true });
const fixedDate = new Date('2026-01-01T00:00:00Z');

async function newDoc(title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer('vidopdf fixtures');
  doc.setCreator('vidopdf fixtures');
  doc.setCreationDate(fixedDate);
  doc.setModificationDate(fixedDate);
  return doc;
}

async function addPage(doc, label, size, rotation = 0) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(size);
  page.setRotation(degrees(rotation));
  page.drawRectangle({
    x: 20,
    y: 20,
    width: size[0] - 40,
    height: size[1] - 40,
    color: rgb(0.9, 0.93, 1),
  });
  page.drawText(label, { x: 40, y: size[1] / 2, size: 28, font, color: rgb(0.1, 0.1, 0.3) });
}

async function write(name, doc, options = {}) {
  const bytes = await doc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
    ...options,
  });
  writeFileSync(join(outDir, name), bytes);
  return bytes;
}

const A4 = [595, 842];
const LETTER = [612, 792];

const a = await newDoc('Fixture A');
await addPage(a, 'A-1', A4);
await addPage(a, 'A-2', LETTER);
await addPage(a, 'A-3', [400, 300]);
const aBytes = await write('mixed-sizes-3p.pdf', a);

const b = await newDoc('Fixture B');
await addPage(b, 'B-1', A4);
await addPage(b, 'B-2', A4, 90);
await write('rotated-2p.pdf', b);

const c = await newDoc('Fixture C');
await addPage(c, 'C-1', LETTER);
await write('single-1p.pdf', c);

const owner = await newDoc('Fixture owner-restricted');
await addPage(owner, 'OWNER-1', A4);
owner.encrypt({
  ownerPassword: 'fixture-owner',
  userPassword: '',
  permissions: { printing: false, copying: false, modifying: false },
});
await write('encrypted-owner-restricted.pdf', owner);

const user = await newDoc('Fixture user-password');
await addPage(user, 'USER-1', A4);
user.encrypt({ ownerPassword: 'fixture-owner', userPassword: 'fixture-user' });
await write('encrypted-user-password.pdf', user);

// --- Features that pdf-lib's copyPages is known to lose or keep: see merge-limits.test.ts. ---

const bookmarks = await newDoc('Fixture bookmarks');
for (const label of ['BM-1', 'BM-2', 'BM-3']) await addPage(bookmarks, label, A4);
{
  const ctx = bookmarks.context;
  const pages = bookmarks.getPages();
  const root = ctx.nextRef();
  const refs = pages.map(() => ctx.nextRef());
  pages.forEach((page, i) => {
    const dict = ctx.obj({
      Title: PDFString.of(`Chapter ${String(i + 1)}`),
      Parent: root,
      Dest: [page.ref, PDFName.of('Fit')],
      ...(i > 0 ? { Prev: refs[i - 1] } : {}),
      ...(i < pages.length - 1 ? { Next: refs[i + 1] } : {}),
    });
    ctx.assign(refs[i], dict);
  });
  ctx.assign(
    root,
    ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs.at(-1), Count: pages.length }),
  );
  bookmarks.catalog.set(PDFName.of('Outlines'), root);
}
await write('bookmarks-3p.pdf', bookmarks);

// Nested bookmarks reached in every way a real file does: a direct destination, a named one,
// a deeper level, and two entries that lead nowhere (no destination, a page that does not exist).
const nested = await newDoc('Fixture nested bookmarks');
for (let n = 1; n <= 6; n++) await addPage(nested, `NB-${String(n)}`, A4);
{
  const ctx = nested.context;
  const pages = nested.getPages();
  const dest = (i) => [pages[i].ref, PDFName.of('XYZ'), null, null, null];
  nested.catalog.set(PDFName.of('Dests'), ctx.obj({ NamedA1: dest(1), NamedB: dest(3) }));
  const entries = [
    { title: 'Part A', level: 1, dest: dest(0) },
    { title: 'A.1', level: 2, dest: PDFString.of('NamedA1') },
    { title: 'A.2', level: 2, dest: dest(2) },
    { title: 'Part B', level: 1, dest: PDFString.of('NamedB') },
    { title: 'B.1', level: 2, dest: dest(4) },
    { title: 'No destination', level: 1 },
    { title: 'Missing page', level: 1, dest: [ctx.nextRef(), PDFName.of('Fit')] },
    { title: 'Part C', level: 1, dest: dest(5) },
  ];
  const root = ctx.nextRef();
  const refs = entries.map(() => ctx.nextRef());
  const parentOf = (i) => {
    for (let j = i - 1; j >= 0; j--) if (entries[j].level < entries[i].level) return refs[j];
    return root;
  };
  const siblings = (i) => {
    const parent = parentOf(i);
    return entries.map((_, j) => j).filter((j) => parentOf(j) === parent);
  };
  entries.forEach((entry, i) => {
    const sibs = siblings(i);
    const position = sibs.indexOf(i);
    const kids = entries.map((_, j) => j).filter((j) => parentOf(j) === refs[i]);
    const dict = {
      Title: PDFString.of(entry.title),
      Parent: parentOf(i),
      ...(entry.dest === undefined ? {} : { Dest: entry.dest }),
      ...(position > 0 ? { Prev: refs[sibs[position - 1]] } : {}),
      ...(position < sibs.length - 1 ? { Next: refs[sibs[position + 1]] } : {}),
      ...(kids.length > 0
        ? { First: refs[kids[0]], Last: refs[kids.at(-1)], Count: kids.length }
        : {}),
    };
    ctx.assign(refs[i], ctx.obj(dict));
  });
  const top = entries.map((_, i) => i).filter((i) => parentOf(i) === root);
  ctx.assign(
    root,
    ctx.obj({
      Type: 'Outlines',
      First: refs[top[0]],
      Last: refs[top.at(-1)],
      Count: entries.length,
    }),
  );
  nested.catalog.set(PDFName.of('Outlines'), root);
}
await write('bookmarks-nested-6p.pdf', nested);

const form = await newDoc('Fixture form');
await addPage(form, 'FORM-1', A4);
{
  const f = form.getForm();
  const text = f.createTextField('full_name');
  text.setText('Ada Lovelace');
  text.addToPage(form.getPage(0), { x: 40, y: 600, width: 200, height: 24 });
  const check = f.createCheckBox('accept');
  check.check();
  check.addToPage(form.getPage(0), { x: 40, y: 560, width: 18, height: 18 });
}
await write('form-1p.pdf', form);

const tagged = await newDoc('Fixture tagged');
await addPage(tagged, 'TAG-1', A4);
await addPage(tagged, 'TAG-2', A4);
tagged.catalog.set(PDFName.of('MarkInfo'), tagged.context.obj({ Marked: true }));
tagged.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'));
tagged.catalog.set(
  PDFName.of('StructTreeRoot'),
  tagged.context.obj({ Type: 'StructTreeRoot', K: [] }),
);
await write('tagged-2p.pdf', tagged);

const links = await newDoc('Fixture links');
await addPage(links, 'LINK-1', A4);
{
  const ctx = links.context;
  const annot = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [40, 380, 300, 440],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org/') },
    }),
  );
  links.getPage(0).node.set(PDFName.of('Annots'), ctx.obj([annot]));
}
await write('links-1p.pdf', links);

function image(width, height, draw) {
  const canvas = createCanvas(width, height);
  draw(canvas.getContext('2d'), width, height);
  return canvas;
}

const gradient = (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1d4ed8');
  g.addColorStop(1, '#f59e0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

const images = await newDoc('Fixture images');
{
  const png = await images.embedPng(image(400, 300, gradient).toBuffer('image/png'));
  const jpg = await images.embedJpg(image(400, 300, gradient).toBuffer('image/jpeg', 90));
  for (const [label, picture] of [
    ['IMG-PNG', png],
    ['IMG-JPG', jpg],
  ]) {
    await addPage(images, label, A4);
    images.getPages().at(-1).drawImage(picture, { x: 60, y: 420, width: 400, height: 300 });
  }
}
await write('images-2p.pdf', images);

// A "scan": every page is one full-page JPEG of pseudo-text lines and carries no text layer.
const scan = await newDoc('Fixture scan');
for (let n = 0; n < 2; n++) {
  const picture = image(620, 877, (ctx, w, h) => {
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#222';
    let seed = 7 + n;
    for (let y = 60; y < h - 60; y += 22) {
      for (let x = 50; x < w - 50;) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const word = 20 + (seed % 60);
        ctx.fillRect(x, y, Math.min(word, w - 50 - x), 8);
        x += word + 10;
      }
    }
  });
  const jpg = await scan.embedJpg(picture.toBuffer('image/jpeg', 85));
  const page = scan.addPage(A4);
  page.drawImage(jpg, { x: 0, y: 0, width: A4[0], height: A4[1] });
}
await write('scanned-2p.pdf', scan);

// A high-resolution scan: 1240 x 1754 pixels (A4 at 150 dpi). A picture this much larger than a
// thumbnail makes pdf.js draw it through a scratch canvas, which is where it once failed in a worker.
const largeScan = await newDoc('Fixture large scan');
{
  const picture = image(1240, 1754, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#222';
    let seed = 99;
    for (let y = 100; y < h - 100; y += 34) {
      for (let x = 100; x < w - 100;) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const word = 40 + (seed % 120);
        ctx.fillRect(x, y, Math.min(word, w - 100 - x), 14);
        x += word + 18;
      }
    }
  });
  const jpg = await largeScan.embedJpg(picture.toBuffer('image/jpeg', 50));
  largeScan.addPage(A4).drawImage(jpg, { x: 0, y: 0, width: A4[0], height: A4[1] });
}
await write('scanned-large-1p.pdf', largeScan);

const many = await newDoc('Fixture 300 pages');
{
  const font = await many.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 300; n++) {
    const page = many.addPage(A4);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A4[0],
      height: A4[1],
      color: rgb((n % 10) / 12 + 0.1, 0.9 - (n % 7) / 20, 0.95),
    });
    page.drawText(`PAGE ${String(n)}`, {
      x: 60,
      y: 420,
      size: 48,
      font,
      color: rgb(0.05, 0.05, 0.2),
    });
  }
}
await write('pages-300.pdf', many);

if (process.argv.includes('--big')) {
  // Large documents for benchmarks. Not committed (tests/fixtures/generated/big is ignored).
  const bigDir = join(outDir, 'big');
  mkdirSync(bigDir, { recursive: true });
  const big = await newDoc('Fixture 1000 pages');
  const font = await big.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 1000; n++) {
    const page = big.addPage(A4);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A4[0],
      height: A4[1],
      color: rgb((n % 10) / 12 + 0.1, 0.9 - (n % 7) / 20, 0.95),
    });
    page.drawText(`PAGE ${String(n)}`, {
      x: 60,
      y: 420,
      size: 48,
      font,
      color: rgb(0.05, 0.05, 0.2),
    });
    for (let line = 0; line < 30; line++) {
      page.drawText(`Line ${String(line + 1)} of page ${String(n)}: lorem ipsum dolor sit amet`, {
        x: 60,
        y: 760 - line * 14,
        size: 9,
        font,
      });
    }
  }
  writeFileSync(join(bigDir, 'pages-1000.pdf'), await big.save({ useObjectStreams: false }));
}

writeFileSync(join(outDir, 'truncated.pdf'), aBytes.slice(0, Math.floor(aBytes.length / 2)));
writeFileSync(join(outDir, 'zero-bytes.pdf'), new Uint8Array(0));
writeFileSync(
  join(outDir, 'not-a-pdf.pdf'),
  new TextEncoder().encode('This is plain text, not a PDF.'),
);
process.stdout.write(`Fixtures written to ${outDir}\n`);
