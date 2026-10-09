import type { BlankPage, OriginalPage } from './workspace/page-ref';
import type { SourceFile, Workspace } from './workspace/workspace';
import { emptyWorkspace } from './workspace/workspace';

export function source(id: string, pageCount: number): SourceFile {
  return {
    id,
    name: `${id}.pdf`,
    pageCount,
    size: pageCount * 1000,
    fingerprint: id,
    encrypted: false,
  };
}

export function original(id: string, sourceId = 's1', sourceIndex = 0): OriginalPage {
  return { kind: 'original', id, sourceId, sourceIndex, rotation: 0 };
}

export function blank(id: string): BlankPage {
  return { kind: 'blank', id, width: 595, height: 842, rotation: 0 };
}

/** A workspace with pages p0..p{n-1} from one source. */
export function workspaceOf(count: number): Workspace {
  const pages = Array.from({ length: count }, (_, i) => original(`p${String(i)}`, 's1', i));
  return { ...emptyWorkspace, sources: [source('s1', count)], pages };
}

export function ids(workspace: Workspace): string[] {
  return workspace.pages.map((page) => page.id);
}
