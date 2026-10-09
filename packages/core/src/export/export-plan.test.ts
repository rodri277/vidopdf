import { describe, expect, it } from 'vitest';
import { blank, workspaceOf } from '../test-helpers';
import { rotatePages } from '../history/command';
import { buildExportPlan, exportPageCount } from './export-plan';

describe('buildExportPlan', () => {
  it('assembles the pages in order, with rotation, blank pages included', () => {
    const ws = rotatePages(['p1'], 90).apply({
      ...workspaceOf(2),
      pages: [...workspaceOf(2).pages, blank('b')],
    });
    const plan = buildExportPlan(ws);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.pages).toEqual([
      { kind: 'original', sourceId: 's1', pageIndex: 0, rotation: 0 },
      { kind: 'original', sourceId: 's1', pageIndex: 1, rotation: 90 },
      { kind: 'blank', width: 595, height: 842, rotation: 0 },
    ]);
    expect(exportPageCount(plan)).toBe(3);
  });
});
