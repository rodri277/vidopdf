import { describe, expect, it } from 'vitest';
import { blank, source, workspaceOf } from '../test-helpers';
import { rotatePages } from '../history/command';
import { selectOnly, toggleSelection } from '../workspace/selection';
import { splitEveryN, splitByRanges, splitByBookmarks, bookmarkKey } from '../split';
import {
  buildExportPlan,
  buildExtractPlan,
  buildSplitPlan,
  exportPageCount,
  outputPageCount,
  suggestedBaseName,
} from './export-plan';

describe('buildExportPlan', () => {
  it('assembles the pages in order, with rotation, blank pages included', () => {
    const ws = rotatePages(['p1'], 90).apply({
      ...workspaceOf(2),
      pages: [...workspaceOf(2).pages, blank('b')],
    });
    const plan = buildExportPlan(ws);
    expect(plan.outputs).toHaveLength(1);
    expect(plan.outputs[0]?.steps[0]?.pages).toEqual([
      { kind: 'original', sourceId: 's1', pageIndex: 0, rotation: 0 },
      { kind: 'original', sourceId: 's1', pageIndex: 1, rotation: 90 },
      { kind: 'blank', width: 595, height: 842, rotation: 0 },
    ]);
    expect(exportPageCount(plan)).toBe(3);
    expect(outputPageCount(plan.outputs[0] ?? { name: '', steps: [] })).toBe(3);
  });

  it('is named after the file when there is only one, and "vidopdf" otherwise', () => {
    expect(buildExportPlan(workspaceOf(2)).outputs[0]?.name).toBe('s1.pdf');
    const two = { ...workspaceOf(2), sources: [source('a', 1), source('b', 1)] };
    expect(buildExportPlan(two).outputs[0]?.name).toBe('vidopdf.pdf');
    expect(suggestedBaseName({ ...two, sources: [] })).toBe('vidopdf');
  });

  it('cleans a name it is given', () => {
    expect(buildExportPlan(workspaceOf(1), '../evil/name').outputs[0]?.name).toBe('_evil_name.pdf');
  });
});

describe('buildExtractPlan', () => {
  it('keeps the selected pages in document order', () => {
    const ws = toggleSelection(selectOnly(workspaceOf(5), 'p3'), 'p1');
    const plan = buildExtractPlan(ws);
    expect(plan?.outputs[0]?.name).toBe('s1_extract.pdf');
    expect(
      plan?.outputs[0]?.steps[0]?.pages.map((p) => (p.kind === 'original' ? p.pageIndex : -1)),
    ).toEqual([1, 3]);
  });

  it('has nothing to extract without a selection', () => {
    expect(buildExtractPlan(workspaceOf(3))).toBeUndefined();
  });
});

describe('buildSplitPlan', () => {
  const pages = [...workspaceOf(7).pages];
  const groups = (result: ReturnType<typeof splitEveryN>) => (result.ok ? result.value : []);

  it('makes one numbered file per part, padded to the number of files', () => {
    const plan = buildSplitPlan(groups(splitEveryN([...workspaceOf(25).pages], 2)), 'report');
    expect(plan.outputs).toHaveLength(13);
    expect(plan.outputs[0]?.name).toBe('report_01.pdf');
    expect(plan.outputs[12]?.name).toBe('report_13.pdf');
    expect(exportPageCount(plan)).toBe(25);
  });

  it('names range files after their pages and the leftover group "rest"', () => {
    const result = splitByRanges(
      pages,
      [
        { from: 1, to: 3 },
        { from: 6, to: 6 },
      ],
      'group',
    );
    const plan = buildSplitPlan(groups(result), 'doc');
    expect(plan.outputs.map((o) => o.name)).toEqual(['doc_p1-3.pdf', 'doc_p6.pdf', 'doc_rest.pdf']);
  });

  it('names bookmark files after the bookmark, safely, and keeps them different', () => {
    const marks = new Map([
      [bookmarkKey('s1', 0), 'Intro: "why"'],
      [bookmarkKey('s1', 2), 'intro: "why"'],
    ]);
    const plan = buildSplitPlan(groups(splitByBookmarks(pages, marks)), 'book');
    expect(plan.outputs.map((o) => o.name)).toEqual([
      'book - Intro_ _why_.pdf',
      'book - intro_ _why_ (2).pdf',
    ]);
  });

  it('falls back to the plain name when the base is empty', () => {
    expect(buildSplitPlan(groups(splitEveryN(pages, 7)), '').outputs[0]?.name).toBe(
      'vidopdf_1.pdf',
    );
  });
});
