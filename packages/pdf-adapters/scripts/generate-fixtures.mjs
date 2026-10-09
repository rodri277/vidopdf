// Generates the code-made PDFs in tests/fixtures/generated. Output is deterministic (fixed dates),
// so rerunning it leaves git clean. Provenance: tests/fixtures/README.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';

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

writeFileSync(join(outDir, 'truncated.pdf'), aBytes.slice(0, Math.floor(aBytes.length / 2)));
writeFileSync(join(outDir, 'zero-bytes.pdf'), new Uint8Array(0));
writeFileSync(
  join(outDir, 'not-a-pdf.pdf'),
  new TextEncoder().encode('This is plain text, not a PDF.'),
);
process.stdout.write(`Fixtures written to ${outDir}\n`);
