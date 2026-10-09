import type { CompressionPreset } from '../ports';
import { safeFileName, paddedNumber, stripExtension, uniqueNames } from '../names';
import type { PageGroup } from '../split/groups';
import { formatRange } from '../split/ranges';
import { toExportPage } from '../workspace/page-ref';
import type { ExportPage, PageRef } from '../workspace/page-ref';
import type { Workspace } from '../workspace/workspace';

/** Steps run in order. v2 adds stamping and protection. */
export interface AssembleStep {
  readonly kind: 'assemble';
  readonly pages: readonly ExportPage[];
}

/** Recompresses the pictures of what the earlier steps built (ADR 004). */
export interface CompressStep {
  readonly kind: 'compress';
  readonly preset: CompressionPreset;
}

export type ExportStep = AssembleStep | CompressStep;

/** One file to produce. With several outputs the app packs them into a ZIP. */
export interface ExportOutput {
  readonly name: string;
  readonly steps: readonly ExportStep[];
}

export interface ExportPlan {
  readonly outputs: readonly ExportOutput[];
}

const DEFAULT_BASE = 'vidopdf';

/** The name a result is based on: the file's own name when the workspace holds just one. */
export function suggestedBaseName(workspace: Workspace): string {
  const [only, ...others] = workspace.sources;
  return only !== undefined && others.length === 0
    ? safeFileName(stripExtension(only.name), DEFAULT_BASE)
    : DEFAULT_BASE;
}

function assemble(
  pages: readonly PageRef[],
  compression?: CompressionPreset,
): readonly ExportStep[] {
  const built: ExportStep = { kind: 'assemble', pages: pages.map(toExportPage) };
  return compression === undefined ? [built] : [built, { kind: 'compress', preset: compression }];
}

/** Everything in the workspace, in order, as one PDF. */
export function buildExportPlan(
  workspace: Workspace,
  base = suggestedBaseName(workspace),
  compression?: CompressionPreset,
): ExportPlan {
  return {
    outputs: [
      {
        name: `${safeFileName(base, DEFAULT_BASE)}.pdf`,
        steps: assemble(workspace.pages, compression),
      },
    ],
  };
}

/** Only the selected pages, in document order, as one PDF ("extract"). */
export function buildExtractPlan(
  workspace: Workspace,
  base = suggestedBaseName(workspace),
  compression?: CompressionPreset,
): ExportPlan | undefined {
  if (workspace.selection.length === 0) return undefined;
  const chosen = new Set(workspace.selection);
  const pages = workspace.pages.filter((page) => chosen.has(page.id));
  return {
    outputs: [
      {
        name: `${safeFileName(base, DEFAULT_BASE)}_extract.pdf`,
        steps: assemble(pages, compression),
      },
    ],
  };
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
  groups: readonly PageGroup[],
  base: string,
  compression?: CompressionPreset,
): ExportPlan {
  const safeBase = safeFileName(base, DEFAULT_BASE);
  const names = uniqueNames(
    groups.map(
      (group, index) => `${safeFileName(groupStem(group, safeBase, index, groups.length))}.pdf`,
    ),
  );
  return {
    outputs: groups.map((group, index) => ({
      name: names[index] ?? `${safeBase}.pdf`,
      steps: assemble(group.pages, compression),
    })),
  };
}

export function outputPageCount(output: ExportOutput): number {
  return output.steps.reduce(
    (total, step) => total + (step.kind === 'assemble' ? step.pages.length : 0),
    0,
  );
}

/** The preset an output is compressed with, if it is. */
export function outputCompression(output: ExportOutput): CompressionPreset | undefined {
  for (const step of output.steps) if (step.kind === 'compress') return step.preset;
  return undefined;
}

export function exportPageCount(plan: ExportPlan): number {
  return plan.outputs.reduce((total, output) => total + outputPageCount(output), 0);
}
