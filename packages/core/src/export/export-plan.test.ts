import { describe, expect, it } from 'vitest';
import { blank, source, workspaceOf } from '../test-helpers';
import { rotatePages } from '../history/command';
import { NO_METADATA } from '../document/metadata';
import { ALL_ALLOWED } from '../security/permissions';
import { presets } from '../stamps/stamp';
import { selectOnly, toggleSelection } from '../workspace/selection';
import { splitEveryN, splitByRanges, splitByBookmarks, bookmarkKey } from '../split';
import {
  buildExportPlan,
  buildExtractPlan,
  buildSplitPlan,
  exportPageCount,
  outputCompression,
  outputProtection,
  outputPageCount,
  suggestedBaseName,
} from './export-plan';
import type { ExportOutput } from './export-plan';
import type { ExportPage } from '../workspace/page-ref';

/** The pages of an output's assemble step. */
function pagesOf(output: ExportOutput | undefined): readonly ExportPage[] {
  const step = output?.steps[0];
  return step?.kind === 'assemble' ? step.pages : [];
}

describe('buildExportPlan', () => {
  it('assembles the pages in order, with rotation, blank pages included', () => {
    const ws = rotatePages(['p1'], 90).apply({
      ...workspaceOf(2),
      pages: [...workspaceOf(2).pages, blank('b')],
    });
    const plan = buildExportPlan(ws);
    expect(plan.outputs).toHaveLength(1);
    expect(pagesOf(plan.outputs[0])).toEqual([
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
    expect(buildExportPlan(workspaceOf(1), { base: '../evil/name' }).outputs[0]?.name).toBe(
      '_evil_name.pdf',
    );
  });
});

describe('buildExtractPlan', () => {
  it('keeps the selected pages in document order', () => {
    const ws = toggleSelection(selectOnly(workspaceOf(5), 'p3'), 'p1');
    const plan = buildExtractPlan(ws);
    expect(plan?.outputs[0]?.name).toBe('s1_extract.pdf');
    expect(
      pagesOf(plan?.outputs[0]).map((p) => (p.kind === 'original' ? p.pageIndex : -1)),
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
    const plan = buildSplitPlan(
      workspaceOf(25),
      groups(splitEveryN([...workspaceOf(25).pages], 2)),
      'report',
    );
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
    const plan = buildSplitPlan(workspaceOf(25), groups(result), 'doc');
    expect(plan.outputs.map((o) => o.name)).toEqual(['doc_p1-3.pdf', 'doc_p6.pdf', 'doc_rest.pdf']);
  });

  it('names bookmark files after the bookmark, safely, and keeps them different', () => {
    const marks = new Map([
      [bookmarkKey('s1', 0), 'Intro: "why"'],
      [bookmarkKey('s1', 2), 'intro: "why"'],
    ]);
    const plan = buildSplitPlan(workspaceOf(25), groups(splitByBookmarks(pages, marks)), 'book');
    expect(plan.outputs.map((o) => o.name)).toEqual([
      'book - Intro_ _why_.pdf',
      'book - intro_ _why_ (2).pdf',
    ]);
  });

  it('falls back to the plain name when the base is empty', () => {
    expect(
      buildSplitPlan(workspaceOf(25), groups(splitEveryN(pages, 7)), '').outputs[0]?.name,
    ).toBe('vidopdf_1.pdf');
  });
});

describe('compression in a plan', () => {
  it('adds one compress step after the pages of every output, and none otherwise', () => {
    const plain = buildExportPlan(workspaceOf(3));
    expect(plain.outputs[0]?.steps.map((step) => step.kind)).toEqual(['assemble']);
    expect(outputCompression(plain.outputs[0] ?? { name: '', steps: [] })).toBeUndefined();

    const packed = buildExportPlan(workspaceOf(3), { base: 'doc', compression: 'balanced' });
    expect(packed.outputs[0]?.steps.map((step) => step.kind)).toEqual(['assemble', 'compress']);
    expect(outputCompression(packed.outputs[0] ?? { name: '', steps: [] })).toBe('balanced');
    expect(exportPageCount(packed)).toBe(3);
  });

  it('applies to extracts and to every part of a split', () => {
    const ws = selectOnly(workspaceOf(3), workspaceOf(3).pages[1]?.id ?? '');
    const extract = buildExtractPlan(ws, { base: 'doc', compression: 'screen' });
    expect(outputCompression(extract?.outputs[0] ?? { name: '', steps: [] })).toBe('screen');
    const split = splitEveryN([...workspaceOf(4).pages], 2);
    const parts = buildSplitPlan(workspaceOf(4), split.ok ? split.value : [], 'doc', {
      compression: 'print',
    });
    expect(parts.outputs.map(outputCompression)).toEqual(['print', 'print']);
    expect(exportPageCount(parts)).toBe(4);
  });
});

describe('what the plan carries for version 2', () => {
  const ws = {
    ...workspaceOf(4),
    stamps: [presets.pageNumber('n')],
    metadata: { ...NO_METADATA, title: 'Report' },
  };
  const assemble = (output: ExportOutput | undefined) => {
    const step = output?.steps[0];
    if (step?.kind !== 'assemble') throw new Error('no assemble step');
    return step;
  };

  it('puts the stamps, the metadata and the file name in the assemble step of every output', () => {
    const plan = buildExportPlan(ws, { base: 'doc', date: '2026-10-09' });
    const step = assemble(plan.outputs[0]);
    expect(step.decorations).toMatchObject({
      fileName: 'doc.pdf',
      date: '2026-10-09',
      metadata: { title: 'Report' },
      formMode: 'keep',
    });
    expect(step.decorations.stamps).toHaveLength(1);
  });

  it('gives each file of a split its own name for {file}', () => {
    const split = splitEveryN([...ws.pages], 2);
    const plan = buildSplitPlan(ws, split.ok ? split.value : [], 'doc');
    expect(plan.outputs.map((o) => assemble(o).decorations.fileName)).toEqual([
      'doc_1.pdf',
      'doc_2.pdf',
    ]);
  });

  it('resolves the bookmarks against the pages of each output, so a split keeps only its own', () => {
    const tree = [
      { id: 'a', title: 'First', pageId: 'p0', children: [] },
      { id: 'b', title: 'Third', pageId: 'p2', children: [] },
    ];
    const split = splitEveryN([...ws.pages], 2);
    const plan = buildSplitPlan(ws, split.ok ? split.value : [], 'doc', { bookmarks: tree });
    expect(
      plan.outputs.map((o) => assemble(o).decorations.bookmarks.map((b) => [b.title, b.pageIndex])),
    ).toEqual([[['First', 0]], [['Third', 0]]]);
  });

  it('attaches the crop and the signatures of a page to that page only', () => {
    const edited = {
      ...ws,
      edits: {
        p1: {
          crop: { top: 0.1, right: 0, bottom: 0, left: 0 },
          overlays: [{ id: 'o', assetId: 'sig', x: 0.1, y: 0.1, width: 0.2, aspect: 0.5 }],
        },
      },
    };
    const pages = assemble(buildExportPlan(edited).outputs[0]).pages;
    expect(pages[0]).not.toHaveProperty('crop');
    expect(pages[1]).toMatchObject({ crop: { top: 0.1 }, overlays: [{ id: 'o' }] });
    expect(pages[2]).not.toHaveProperty('overlays');
  });

  it('adds the protection last, after compression, and leaves it out unless asked', () => {
    expect(
      outputProtection(buildExportPlan(ws).outputs[0] ?? { name: '', steps: [] }),
    ).toBeUndefined();
    const plan = buildExportPlan(ws, {
      compression: 'balanced',
      protect: { userPassword: 'open', permissions: ALL_ALLOWED },
    });
    const kinds = plan.outputs[0]?.steps.map((step) => step.kind);
    expect(kinds).toEqual(['assemble', 'compress', 'protect']);
    expect(outputProtection(plan.outputs[0] ?? { name: '', steps: [] })?.userPassword).toBe('open');
    expect(exportPageCount(plan)).toBe(4);
  });
});
