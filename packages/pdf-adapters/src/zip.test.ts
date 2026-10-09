import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createZipBuilder } from './zip';

const text = (value: string) => new TextEncoder().encode(value);
const mtime = new Date('2026-01-01T12:00:00Z');

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('createZipBuilder', () => {
  it('stores entries so that a standard unzip gets back the same bytes, in the same order', () => {
    const zip = createZipBuilder({ mtime });
    const big = new Uint8Array(50_000).map((_, i) => i % 251);
    must(zip.add('a.pdf', text('%PDF-1.7 first')));
    must(zip.add('b.png', big));
    const files = unzipSync(must(zip.finish()));
    expect(Object.keys(files)).toEqual(['a.pdf', 'b.png']);
    expect(files['a.pdf']).toEqual(text('%PDF-1.7 first'));
    expect(files['b.png']).toEqual(big);
  });

  it('deflates on request, which makes repetitive data much smaller', () => {
    const repetitive = text('0 obj << /Type /Page >> endobj\n'.repeat(2000));
    const stored = createZipBuilder({ mtime });
    must(stored.add('x.pdf', repetitive));
    const deflated = createZipBuilder({ mtime });
    must(deflated.add('x.pdf', repetitive, { deflate: true }));
    const small = must(deflated.finish());
    expect(small.byteLength).toBeLessThan(must(stored.finish()).byteLength / 10);
    expect(unzipSync(small)['x.pdf']).toEqual(repetitive);
  });

  it('keeps accented and non-Latin names intact', () => {
    const zip = createZipBuilder({ mtime });
    must(zip.add('informe – capítulo 2 ✓.pdf', text('x')));
    expect(Object.keys(unzipSync(must(zip.finish())))).toEqual(['informe – capítulo 2 ✓.pdf']);
  });

  it('refuses names that could escape the folder it is unpacked into', () => {
    const zip = createZipBuilder({ mtime });
    for (const name of ['', '/etc/passwd', '\\windows', '../x.pdf', 'a/../../x', 'a\\..\\x']) {
      expect(zip.add(name, text('x')), name).toMatchObject({ ok: false });
    }
    expect(Object.keys(unzipSync(must(zip.finish())))).toEqual([]);
  });

  it('refuses a second entry with the same name, ignoring case', () => {
    const zip = createZipBuilder({ mtime });
    must(zip.add('a.pdf', text('1')));
    expect(zip.add('A.PDF', text('2'))).toMatchObject({ ok: false, error: { kind: 'internal' } });
  });

  it('cannot be used after it is finished', () => {
    const zip = createZipBuilder({ mtime });
    must(zip.finish());
    expect(zip.add('late.pdf', text('x'))).toMatchObject({ ok: false });
    expect(zip.finish()).toMatchObject({ ok: false });
  });

  it('writes an empty but valid archive', () => {
    expect(unzipSync(must(createZipBuilder({ mtime }).finish()))).toEqual({});
  });

  it('uses the time given for every entry, so the output is reproducible', () => {
    const build = () => {
      const zip = createZipBuilder({ mtime });
      must(zip.add('a.pdf', text('same'), { deflate: true }));
      return must(zip.finish());
    };
    expect(build()).toEqual(build());
  });

  it('produces an archive the system unzip accepts', () => {
    const probe = spawnSync('unzip', ['-v']);
    if (probe.error !== undefined) return; // no unzip on this machine: the fflate round trips above still ran
    const zip = createZipBuilder({ mtime });
    must(zip.add('one.pdf', text('%PDF'.repeat(1000)), { deflate: true }));
    must(zip.add('two.png', new Uint8Array(1000)));
    const file = join(mkdtempSync(join(tmpdir(), 'vidopdf-zip-')), 'out.zip');
    writeFileSync(file, must(zip.finish()));
    expect(() => execFileSync('unzip', ['-tq', file], { stdio: 'pipe' })).not.toThrow();
  });
});
