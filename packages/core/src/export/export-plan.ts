import { resolveBookmarks } from '../bookmarks/tree';
import type { BookmarkNode, ResolvedBookmark } from '../bookmarks/tree';
import type { MetadataSettings } from '../document/metadata';
import type { FormMode, FormValues } from '../forms';
import { safeFileName, paddedNumber, stripExtension, uniqueNames } from '../names';
import type { Permissions } from '../security/permissions';
import type { Stamp } from '../stamps/stamp';
import type { PageGroup } from '../split/groups';
import { formatRange } from '../split/ranges';
import { toExportPage } from '../workspace/page-ref';
import type { ExportPage, PageRef } from '../workspace/page-ref';
import type { Workspace } from '../workspace/workspace';
import type { CompressionPreset } from '../ports';

/**
 * What is done to the document while it is assembled, because it needs the document before it is
 * saved: stamps, metadata, bookmarks and form values.
 */
export interface Decorations {
  readonly stamps: readonly Stamp[];
  /** Name of the output, for `{file}` in a stamp. */
  readonly fileName: string;
  /** The day of export, for `{date}`. */
  readonly date: string;
  readonly metadata: MetadataSettings;
  /** Resolved against the pages of this output. */
  readonly bookmarks: readonly ResolvedBookmark[];
  readonly forms: FormValues;
  readonly formMode: FormMode;
}

/** Steps run in order. */
export interface AssembleStep {
  readonly kind: 'assemble';
  readonly pages: readonly ExportPage[];
  readonly decorations: Decorations;
}

/** Recompresses the pictures of what the earlier steps built (ADR 004). */
export interface CompressStep {
  readonly kind: 'compress';
  readonly preset: CompressionPreset;
}

/**
 * Protects the result with passwords, last of all. The worker adds the restrictions the sources
 * already had: they are never lifted (ADR 006).
 */
export interface ProtectStep {
  readonly kind: 'protect';
  /** Needed to open the file. */
  readonly userPassword?: string;
  /** Lets whoever knows it change the permissions. Not available when restrictions are inherited. */
  readonly ownerPassword?: string;
  readonly permissions: Permissions;
}

export type ExportStep = AssembleStep | CompressStep | ProtectStep;

/** One file to produce. With several outputs the app packs them into a ZIP. */
export interface ExportOutput {
  readonly name: string;
  readonly steps: readonly ExportStep[];
}

export interface ExportPlan {
  readonly outputs: readonly ExportOutput[];
}

/** What the user chose for an export besides the pages. */
export interface ExportOptions {
  /** The name the files are based on. */
  readonly base?: string;
  readonly compression?: CompressionPreset;
  readonly protect?: Omit<ProtectStep, 'kind'>;
  /** The day of export, written as it should read. */
  readonly date?: string;
  /** The bookmark tree to write (resolved from `auto`, `custom` or `none` by the caller). */
  readonly bookmarks?: readonly BookmarkNode[];
}

const DEFAULT_BASE = 'vidopdf';

/** The name a result is based on: the file's own name when the workspace holds just one. */
export function suggestedBaseName(workspace: Workspace): string {
  const [only, ...others] = workspace.sources;
  return only !== undefined && others.length === 0
    ? safeFileName(stripExtension(only.name), DEFAULT_BASE)
    : DEFAULT_BASE;
}

/** The steps of one output: its pages and what is done to them, then compression and protection. */
function stepsFor(
  workspace: Workspace,
  pages: readonly PageRef[],
  name: string,
  options: ExportOptions,
): readonly ExportStep[] {
  const decorations: Decorations = {
    stamps: workspace.stamps,
    fileName: name,
    date: options.date ?? '',
    metadata: workspace.metadata,
    bookmarks: resolveBookmarks(
      options.bookmarks ?? [],
      pages.map((page) => page.id),
    ),
    forms: workspace.forms,
    formMode: workspace.formMode,
  };
  const steps: ExportStep[] = [
    {
      kind: 'assemble',
      pages: pages.map((page) => toExportPage(page, workspace.edits[page.id])),
      decorations,
    },
  ];
  if (options.compression !== undefined)
    steps.push({ kind: 'compress', preset: options.compression });
  if (options.protect !== undefined) steps.push({ kind: 'protect', ...options.protect });
  return steps;
}

/** Everything in the workspace, in order, as one PDF. */
export function buildExportPlan(workspace: Workspace, options: ExportOptions = {}): ExportPlan {
  const name = `${safeFileName(options.base ?? suggestedBaseName(workspace), DEFAULT_BASE)}.pdf`;
  return { outputs: [{ name, steps: stepsFor(workspace, workspace.pages, name, options) }] };
}

/** Only the selected pages, in document order, as one PDF ("extract"). */
export function buildExtractPlan(
  workspace: Workspace,
  options: ExportOptions = {},
): ExportPlan | undefined {
  if (workspace.selection.length === 0) return undefined;
  const chosen = new Set(workspace.selection);
  const pages = workspace.pages.filter((page) => chosen.has(page.id));
  const name = `${safeFileName(options.base ?? suggestedBaseName(workspace), DEFAULT_BASE)}_extract.pdf`;
  return { outputs: [{ name, steps: stepsFor(workspace, pages, name, options) }] };
}

function groupStem(group: PageGroup, base: string, index: number, total: number): string {
  if (group.title !== undefined) return `${base} - ${group.title}`;
  if (group.kind === 'rest') return `${base}_rest`;
  if (group.kind === 'range' && group.span !== undefined)
    return `${base}_p${formatRange(group.span)}`;
  return `${base}_${paddedNumber(index + 1, total)}`;
}

/** One PDF per group, with names that are safe, readable and different from each other. */
export function buildSplitPlan(
  workspace: Workspace,
  groups: readonly PageGroup[],
  base: string,
  options: Omit<ExportOptions, 'base'> = {},
): ExportPlan {
  const safeBase = safeFileName(base, DEFAULT_BASE);
  const names = uniqueNames(
    groups.map(
      (group, index) => `${safeFileName(groupStem(group, safeBase, index, groups.length))}.pdf`,
    ),
  );
  return {
    outputs: groups.map((group, index) => {
      const name = names[index] ?? `${safeBase}.pdf`;
      return { name, steps: stepsFor(workspace, group.pages, name, options) };
    }),
  };
}

export function outputPageCount(output: ExportOutput): number {
  return output.steps.reduce(
    (total, step) => total + (step.kind === 'assemble' ? step.pages.length : 0),
    0,
  );
}

/** The password step of an output, if it has one. */
export function outputProtection(output: ExportOutput): ProtectStep | undefined {
  return output.steps.find((step): step is ProtectStep => step.kind === 'protect');
}

/** The preset an output is compressed with, if it is. */
export function outputCompression(output: ExportOutput): CompressionPreset | undefined {
  for (const step of output.steps) if (step.kind === 'compress') return step.preset;
  return undefined;
}

export function exportPageCount(plan: ExportPlan): number {
  return plan.outputs.reduce((total, output) => total + outputPageCount(output), 0);
}
