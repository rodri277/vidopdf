import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_ALLOWED, decodePermissions } from '@vidopdf/core';
import type { ExportPage } from '@vidopdf/core';
import { createPdfLibWriter } from './pdflib-writer';
import { fixture } from './testing/fixtures';
import { qpdfCheck } from './testing/qpdf';

const writer = createPdfLibWriter();
const first = (sourceId: string): ExportPage => ({
  kind: 'original',
  sourceId,
  pageIndex: 0,
  rotation: 0,
});
const tmp = mkdtempSync(join(tmpdir(), 'passwords-'));

function qpdf(args: string[], bytes: Uint8Array): string {
  const file = join(tmp, 'x.pdf');
  writeFileSync(file, bytes);
  try {
    return execFileSync('qpdf', [...args, file], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return (failure.stdout ?? '') + (failure.stderr ?? '');
  }
}

describe('opening protected files', () => {
  const locked = fixture('encrypted-user-password.pdf');

  it('asks for a password when a file needs one, and says when the one given is wrong', async () => {
    expect(await writer.inspect(locked)).toMatchObject({
      ok: false,
      error: { kind: 'passwordRequired' },
    });
    expect(await writer.inspect(locked, 'nope')).toMatchObject({
      ok: false,
      error: { kind: 'wrongPassword' },
    });
  });

  it('opens with the right password, and builds from it only when the password is supplied', async () => {
    expect(await writer.inspect(locked, 'fixture-user')).toMatchObject({
      ok: true,
      value: { pageCount: 1 },
    });
    const sources = new Map([['l', locked]]);
    expect(await writer.assemble(sources, [first('l')])).toMatchObject({
      ok: false,
      error: { kind: 'passwordRequired' },
    });
    const built = await writer.assemble(sources, [first('l')], {
      passwords: new Map([['l', 'fixture-user']]),
    });
    if (!built.ok) throw new Error(built.error.kind);
    qpdfCheck(built.value);
    // What comes out of it is not protected: the user decides whether the new file is.
    expect(Buffer.from(built.value).toString('latin1')).not.toContain('/Encrypt');
  });

  it('opens a file that only restricts what readers may do, like any viewer, and reports the restrictions', async () => {
    const info = await writer.inspect(fixture('encrypted-owner-restricted.pdf'));
    if (!info.ok) throw new Error(info.error.kind);
    expect(info.value.restrictions).toBe(-3904);
    expect(decodePermissions(info.value.restrictions ?? 0).copy).toBe(false);
  });

  it('reports no restrictions for an ordinary file', async () => {
    expect(await writer.inspect(fixture('single-1p.pdf'))).toEqual({
      ok: true,
      value: { pageCount: 1 },
    });
  });
});

describe('protecting a result', () => {
  async function plain() {
    const built = await writer.assemble(new Map([['s', fixture('mixed-sizes-3p.pdf')]]), [
      first('s'),
    ]);
    if (!built.ok) throw new Error(built.error.kind);
    return built.value;
  }

  it('needs the password to open, checked by qpdf and by pdf.js, and keeps the pages', async () => {
    const protectedBytes = await writer.protect(await plain(), {
      userPassword: 'open-me',
      ownerPassword: 'owner-pw',
      permissions: { ...ALL_ALLOWED, print: 'none', copy: false },
    });
    if (!protectedBytes.ok) throw new Error(protectedBytes.error.kind);
    expect(qpdf(['--check', '--password=open-me'], protectedBytes.value)).toContain(
      'No syntax or stream encoding errors',
    );
    const shown = qpdf(['--show-encryption', '--password=open-me'], protectedBytes.value);
    expect(shown).toContain('R = 6'); // AES-256
    expect(shown).toMatch(/print high resolution: not allowed/);
    expect(shown).toMatch(/extract for any purpose: not allowed/);
    expect(shown).toMatch(/modify (other )?annotations: allowed/);
    expect(await writer.inspect(protectedBytes.value)).toMatchObject({
      ok: false,
      error: { kind: 'passwordRequired' },
    });
    expect(await writer.inspect(protectedBytes.value, 'open-me')).toMatchObject({
      ok: true,
      value: { pageCount: 1 },
    });
    const info = await writer.inspect(protectedBytes.value, 'open-me');
    expect(info.ok && decodePermissions(info.value.restrictions ?? 0)).toMatchObject({
      print: 'none',
      copy: false,
      modify: true,
    });
  });

  it('encrypts the text of the file too: title, author and bookmark names read back intact', async () => {
    const built = await writer.assemble(
      new Map([['s', fixture('mixed-sizes-3p.pdf')]]),
      [first('s')],
      {
        decorations: {
          stamps: [],
          fileName: 'out.pdf',
          date: '',
          metadata: {
            title: 'Informe año',
            author: 'A. Writer',
            subject: '',
            keywords: ['a', 'b'],
          },
          bookmarks: [{ title: 'Capítulo uno', pageIndex: 0, children: [] }],
          forms: {},
          formMode: 'keep',
        },
      },
    );
    if (!built.ok) throw new Error(built.error.kind);
    const locked = await writer.protect(built.value, {
      userPassword: 'open-me',
      ownerPassword: 'owner-pw',
      permissions: ALL_ALLOWED,
    });
    if (!locked.ok) throw new Error(locked.error.kind);
    const json = qpdf(['--password=open-me', '--json', '--json-key=qpdf'], locked.value);
    expect(json).toContain('"/Title": "u:Informe año"');
    expect(json).toContain('"/Author": "u:A. Writer"');
    expect(json).toContain('"/Keywords": "u:a, b"');
    expect(json).toContain('"/Title": "u:Capítulo uno"');
    expect(qpdf(['--check', '--password=open-me'], locked.value)).toContain('No syntax or stream');
  });

  it('a file with an empty open password opens for anyone and still carries its restrictions', async () => {
    const result = await writer.protect(await plain(), {
      userPassword: '',
      ownerPassword: 'random-owner-password-nobody-keeps',
      permissions: { ...ALL_ALLOWED, modify: false },
    });
    if (!result.ok) throw new Error(result.error.kind);
    const info = await writer.inspect(result.value);
    expect(info).toMatchObject({ ok: true });
    expect(info.ok && decodePermissions(info.value.restrictions ?? 0).modify).toBe(false);
  });
});
