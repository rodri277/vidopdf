/**
 * What a PDF's owner allows readers to do, from the `/P` value of its encryption dictionary
 * (ISO 32000-1, table 22). Restrictions are never lifted by Vidopdf: whatever is exported from a
 * restricted file keeps them (ADR 006 and ADR 016), and these functions are how it is done.
 */
export type PrintLevel = 'none' | 'low' | 'high';

export interface Permissions {
  readonly print: PrintLevel;
  readonly modify: boolean;
  readonly copy: boolean;
  readonly annotate: boolean;
  readonly fillForms: boolean;
  readonly accessibility: boolean;
  readonly assemble: boolean;
}

export const ALL_ALLOWED: Permissions = {
  print: 'high',
  modify: true,
  copy: true,
  annotate: true,
  fillForms: true,
  accessibility: true,
  assemble: true,
};

const PRINT = 1 << 2;
const MODIFY = 1 << 3;
const COPY = 1 << 4;
const ANNOTATE = 1 << 5;
const FILL_FORMS = 1 << 8;
const ACCESSIBILITY = 1 << 9;
const ASSEMBLE = 1 << 10;
const PRINT_HIGH = 1 << 11;
/** Bits 7, 8 and 13 to 32 are reserved and must be 1; bits 1 and 2 must be 0. */
const RESERVED = 0xfffff0c0 | 0;

const has = (p: number, bit: number): boolean => (p & bit) !== 0;

export function decodePermissions(p: number): Permissions {
  const printing = has(p, PRINT);
  return {
    print: !printing ? 'none' : has(p, PRINT_HIGH) ? 'high' : 'low',
    modify: has(p, MODIFY),
    copy: has(p, COPY),
    annotate: has(p, ANNOTATE),
    fillForms: has(p, FILL_FORMS),
    accessibility: has(p, ACCESSIBILITY),
    assemble: has(p, ASSEMBLE),
  };
}

export function encodePermissions(permissions: Permissions): number {
  let p = RESERVED;
  if (permissions.print !== 'none') p |= PRINT;
  if (permissions.print === 'high') p |= PRINT_HIGH;
  if (permissions.modify) p |= MODIFY;
  if (permissions.copy) p |= COPY;
  if (permissions.annotate) p |= ANNOTATE;
  if (permissions.fillForms) p |= FILL_FORMS;
  if (permissions.accessibility) p |= ACCESSIBILITY;
  if (permissions.assemble) p |= ASSEMBLE;
  return p;
}

/** True when the owner took anything away. */
export function isRestricted(permissions: Permissions): boolean {
  return Object.entries(ALL_ALLOWED).some(
    ([key, allowed]) => permissions[key as keyof Permissions] !== allowed,
  );
}

const LEVELS: readonly PrintLevel[] = ['none', 'low', 'high'];

/** What is still allowed when files with these permissions go into one: the least of each. */
export function intersectPermissions(list: readonly Permissions[]): Permissions {
  return list.reduce<Permissions>(
    (so_far, next) => ({
      print: LEVELS[Math.min(LEVELS.indexOf(so_far.print), LEVELS.indexOf(next.print))] ?? 'none',
      modify: so_far.modify && next.modify,
      copy: so_far.copy && next.copy,
      annotate: so_far.annotate && next.annotate,
      fillForms: so_far.fillForms && next.fillForms,
      accessibility: so_far.accessibility && next.accessibility,
      assemble: so_far.assemble && next.assemble,
    }),
    ALL_ALLOWED,
  );
}
