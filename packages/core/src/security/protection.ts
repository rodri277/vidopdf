import type { ProtectOptions } from '../ports';
import { ALL_ALLOWED, intersectPermissions, isRestricted } from './permissions';
import type { Permissions } from './permissions';

/** What the user asked for when protecting a result. */
export interface ProtectChoice {
  /** Needed to open the file. Empty or absent: anyone can open it. */
  readonly userPassword?: string;
  /** Lets whoever knows it change the permissions. */
  readonly ownerPassword?: string;
  readonly permissions: Permissions;
}

export interface Protection {
  readonly options: ProtectOptions;
  /** The output carries restrictions that came from its sources. */
  readonly inherited: boolean;
}

/**
 * How the output of an export is protected, from what the user chose and from the restrictions
 * the files it is made of already had. This is where "restrictions are never lifted" lives
 * (ADR 006 and ADR 016):
 *
 * - whatever any source restricts stays restricted: the permissions are the intersection;
 * - then the owner password is a random one nobody keeps, never the user's: whoever knew it could
 *   lift the restrictions of a file whose owner did not give them that right;
 * - the open password is the user's own choice, and may be empty.
 *
 * Returns undefined when nothing needs protecting: nothing chosen and nothing inherited.
 */
export function protectionFor(
  choice: ProtectChoice | undefined,
  sources: readonly Permissions[],
  randomPassword: () => string,
): Protection | undefined {
  const inherited = sources.length > 0 && isRestricted(intersectPermissions(sources));
  if (choice === undefined && !inherited) return undefined;
  const permissions = intersectPermissions([
    choice?.permissions ?? ALL_ALLOWED,
    ...(inherited ? sources : []),
  ]);
  return {
    inherited,
    options: {
      userPassword: choice?.userPassword ?? '',
      ownerPassword: ownerPasswordFor(choice, inherited, randomPassword),
      permissions,
    },
  };
}

/** The user's own owner password, unless restrictions were inherited or they gave none. */
function ownerPasswordFor(
  choice: ProtectChoice | undefined,
  inherited: boolean,
  randomPassword: () => string,
): string {
  const own = choice?.ownerPassword ?? '';
  return inherited || own === '' ? randomPassword() : own;
}

/** A password nobody has to remember: 24 characters of 6 bits each from the given random bytes. */
export function randomPassword(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(bytes.subarray(0, 24), (byte) => alphabet[byte % 64] ?? 'x').join('');
}
