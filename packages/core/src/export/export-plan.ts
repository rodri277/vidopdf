import { toExportPage } from '../workspace/page-ref';
import type { ExportPage } from '../workspace/page-ref';
import type { Workspace } from '../workspace/workspace';

/** Steps run in order. v2 adds stamping and protection; Phase 3 adds compression. */
export interface AssembleStep {
  readonly kind: 'assemble';
  readonly pages: readonly ExportPage[];
}

export type ExportStep = AssembleStep;

export interface ExportPlan {
  readonly steps: readonly ExportStep[];
}

export function buildExportPlan(workspace: Workspace): ExportPlan {
  return { steps: [{ kind: 'assemble', pages: workspace.pages.map(toExportPage) }] };
}

export function exportPageCount(plan: ExportPlan): number {
  return plan.steps.reduce((total, step) => total + step.pages.length, 0);
}
