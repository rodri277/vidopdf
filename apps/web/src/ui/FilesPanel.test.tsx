import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MEMORY_WARNING_BYTES,
  addSource,
  createSession,
  emptyWorkspace,
  execute,
} from '@vidopdf/core';
import type { SourceFile } from '@vidopdf/core';
import { initI18n } from '../i18n';
import { useSession } from '../state/session';
import { FilesPanel } from './FilesPanel';

const source = (id: string, size: number): SourceFile => ({
  id,
  name: `${id}.pdf`,
  pageCount: 1,
  size,
  fingerprint: id,
  encrypted: false,
});

function load(...sizes: number[]) {
  const session = sizes.reduce(
    (current, size, index) =>
      execute(
        current,
        addSource(source(`f${String(index)}`, size), [
          {
            kind: 'original',
            id: `p${String(index)}`,
            sourceId: `f${String(index)}`,
            sourceIndex: 0,
            rotation: 0,
          },
        ])(current.workspace),
      ),
    createSession(emptyWorkspace),
  );
  useSession.setState({ session });
}

beforeAll(async () => {
  await initI18n();
});

beforeEach(() => {
  useSession.setState({ session: createSession(emptyWorkspace), rejections: [], loading: 0 });
});

describe('FilesPanel memory warning', () => {
  it('stays quiet while the loaded PDFs are under the threshold', () => {
    load(MEMORY_WARNING_BYTES - 1);
    render(<FilesPanel />);
    expect(screen.queryByText(/quedarse sin memoria/)).toBeNull();
  });

  it('warns, with the amount loaded, once they pass it, adding the files up', () => {
    load(MEMORY_WARNING_BYTES / 2, MEMORY_WARNING_BYTES / 2 + 10 * 1024 * 1024);
    render(<FilesPanel />);
    expect(screen.getByText(/Llevas 160 MB de PDFs cargados/)).toBeInTheDocument();
  });

  it('the threshold is the measured 150 MB', () => {
    expect(MEMORY_WARNING_BYTES).toBe(150 * 1024 * 1024);
  });
});
