import { safeFileName, paddedNumber, stripExtension, uniqueNames } from '../names';
import type { PageGroup } from '../split/groups';
import { formatRange } from '../split/ranges';
import { toExportPage } from '../workspace/page-ref';
import type { ExportPage, PageRef } from '../workspace/page-ref';
import type { Workspace } from '../workspace/workspace';

/** Steps run in order. v2 adds stamping and protection; Phase 3 adds compression. */
export interface AssembleStep {
  readonly kind: 'assemble';
  readonly pages: readonly ExportPage[];
}

export type ExportStep = AssembleStep;

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

function assemble(pages: readonly PageRef[]): readonly ExportStep[] {
  return [{ kind: 'assemble', pages: pages.map(toExportPage) }];
}

/** Everything in the workspace, in order, as one PDF. */
export function buildExportPlan(
  workspace: Workspace,
  base = suggestedBaseName(workspace),
): ExportPlan {
  return {
    outputs: [
      { name: `${safeFileName(base, DEFAULT_BASE)}.pdf`, steps: assemble(workspace.pages) },
    ],
  };
}

/** Only the selected pages, in document order, as one PDF ("extract"). */
export function buildExtractPlan(
  workspace: Workspace,
  base = suggestedBaseName(workspace),
): ExportPlan | undefined {
  if (workspace.selection.length === 0) return undefined;
  const chosen = new Set(workspace.selection);
  const pages = workspace.pages.filter((page) => chosen.has(page.id));
  return {
    outputs: [{ name: `${safeFileName(base, DEFAULT_BASE)}_extract.pdf`, steps: assemble(pages) }],
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
export function buildSplitPlan(groups: readonly PageGroup[], base: string): ExportPlan {
  const safeBase = safeFileName(base, DEFAULT_BASE);
  const names = uniqueNames(
    groups.map(
      (group, index) => `${safeFileName(groupStem(group, safeBase, index, groups.length))}.pdf`,
    ),
  );
  return {
    outputs: groups.map((group, index) => ({
      name: names[index] ?? `${safeBase}.pdf`,
      steps: assemble(group.pages),
    })),
  };
}

export function outputPageCount(output: ExportOutput): number {
  return output.steps.reduce((total, step) => total + step.pages.length, 0);
}

export function exportPageCount(plan: ExportPlan): number {
  return plan.outputs.reduce((total, output) => total + outputPageCount(output), 0);
}
