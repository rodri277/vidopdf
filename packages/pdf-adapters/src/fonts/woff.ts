import { unzlibSync } from 'fflate';

const WOFF_SIGNATURE = 0x774f4646; // "wOFF"

/**
 * Unwraps a WOFF 1 file into the plain TrueType (sfnt) font it contains. pdf-lib embeds the bytes
 * it is given as the font program, and a WOFF is not a font program: pdf.js rejects it
 * (ADR 006). The tables are the same, only compressed, so this is lossless.
 */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < 44 || view.getUint32(0) !== WOFF_SIGNATURE) {
    throw new Error('Not a WOFF 1 font');
  }
  const flavor = view.getUint32(4);
  const count = view.getUint16(12);
  const tables = Array.from({ length: count }, (_, index) => {
    const at = 44 + index * 20;
    const offset = view.getUint32(at + 4);
    const compressed = view.getUint32(at + 8);
    const original = view.getUint32(at + 12);
    const raw = woff.subarray(offset, offset + compressed);
    return {
      tag: view.getUint32(at),
      checksum: view.getUint32(at + 16),
      data: compressed < original ? unzlibSync(raw) : raw,
    };
  });

  let size = 12 + count * 16;
  const offsets = tables.map((table) => {
    const at = size;
    size += (table.data.length + 3) & ~3;
    return at;
  });
  const out = new Uint8Array(size);
  const header = new DataView(out.buffer);
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = (1 << entrySelector) * 16;
  header.setUint32(0, flavor);
  header.setUint16(4, count);
  header.setUint16(6, searchRange);
  header.setUint16(8, entrySelector);
  header.setUint16(10, count * 16 - searchRange);
  tables.forEach((table, index) => {
    const at = 12 + index * 16;
    header.setUint32(at, table.tag);
    header.setUint32(at + 4, table.checksum);
    header.setUint32(at + 8, offsets[index] ?? 0);
    header.setUint32(at + 12, table.data.length);
    out.set(table.data, offsets[index] ?? 0);
  });
  return out;
}
