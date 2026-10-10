import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALL_ALLOWED, decodePermissions } from './permissions';
import type { Permissions } from './permissions';
import { protectionFor, randomPassword } from './protection';

const owner = () => 'random-owner';
const copyDenied: Permissions = { ...ALL_ALLOWED, copy: false };
const printDenied: Permissions = { ...ALL_ALLOWED, print: 'none' };

describe('protectionFor', () => {
  it('does nothing when nothing was chosen and nothing is inherited', () => {
    expect(protectionFor(undefined, [], owner)).toBeUndefined();
    expect(protectionFor(undefined, [ALL_ALLOWED, ALL_ALLOWED], owner)).toBeUndefined();
  });

  it('protects with what the user chose, using their owner password if they gave one', () => {
    const result = protectionFor(
      { userPassword: 'open', ownerPassword: 'mine', permissions: copyDenied },
      [ALL_ALLOWED],
      owner,
    );
    expect(result).toEqual({
      inherited: false,
      options: { userPassword: 'open', ownerPassword: 'mine', permissions: copyDenied },
    });
  });

  it('with only an open password, the owner password is a random one', () => {
    const result = protectionFor({ userPassword: 'open', permissions: ALL_ALLOWED }, [], owner);
    expect(result?.options.ownerPassword).toBe('random-owner');
  });

  it('keeps what a source restricted, even if the user chose nothing', () => {
    const result = protectionFor(undefined, [printDenied, ALL_ALLOWED], owner);
    expect(result).toEqual({
      inherited: true,
      options: { userPassword: '', ownerPassword: 'random-owner', permissions: printDenied },
    });
  });

  it('never gives the user the owner password of a file whose restrictions were inherited', () => {
    const result = protectionFor(
      { userPassword: 'open', ownerPassword: 'my-owner', permissions: ALL_ALLOWED },
      [copyDenied],
      owner,
    );
    expect(result?.options.ownerPassword).toBe('random-owner');
    expect(result?.options.permissions.copy).toBe(false);
  });

  it('what is allowed is never more than any source and the choice allow', () => {
    const permissions = fc.record<Permissions>({
      print: fc.constantFrom('none', 'low', 'high'),
      modify: fc.boolean(),
      copy: fc.boolean(),
      annotate: fc.boolean(),
      fillForms: fc.boolean(),
      accessibility: fc.boolean(),
      assemble: fc.boolean(),
    });
    fc.assert(
      fc.property(permissions, fc.array(permissions, { maxLength: 3 }), (chosen, sources) => {
        const result = protectionFor({ permissions: chosen }, sources, owner);
        const out = result?.options.permissions ?? ALL_ALLOWED;
        for (const source of [chosen, ...sources]) {
          for (const key of [
            'modify',
            'copy',
            'annotate',
            'fillForms',
            'accessibility',
            'assemble',
          ] as const) {
            if (!source[key]) expect(out[key]).toBe(false);
          }
          if (source.print === 'none') expect(out.print).toBe('none');
        }
      }),
    );
  });

  it('what the permissions say survives the /P value written into the file', () => {
    const result = protectionFor(undefined, [printDenied], owner);
    expect(decodePermissions(-3904).print).toBe('none');
    expect(result?.options.permissions.print).toBe('none');
  });
});

describe('randomPassword', () => {
  it('is 24 characters from a safe alphabet, and different bytes give different passwords', () => {
    const a = randomPassword(Uint8Array.from({ length: 24 }, (_, i) => i * 7));
    const b = randomPassword(Uint8Array.from({ length: 24 }, (_, i) => i * 11));
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(a).not.toBe(b);
  });
});
