import { describe, expect, it } from 'vitest';
import type { Measurement } from './harness';
import { passes } from './harness';
import { renderMarkdown } from './report';

const environment = {
  date: '2026-10-09',
  version: '0.3.0',
  commit: 'abc1234',
  machine: 'Test CPU (8 cores, linux x64)',
  memory: '16 GB',
  node: 'v24.0.0',
  browser: 'Chromium 150',
};

const m = (changes: Partial<Measurement>): Measurement => ({
  scenario: 'Scroll',
  metric: 'fps',
  value: 60,
  unit: 'fps',
  cpuSlowdown: 1,
  ...changes,
});

describe('passes', () => {
  it('holds a value to its upper budget, or to a lower bound when asked', () => {
    expect(passes(m({ budget: 100, value: 99, unit: 'ms' }))).toBe(true);
    expect(passes(m({ budget: 100, value: 101, unit: 'ms' }))).toBe(false);
    expect(passes(m({ budget: 55, atLeast: true, value: 60 }))).toBe(true);
    expect(passes(m({ budget: 55, atLeast: true, value: 40 }))).toBe(false);
    expect(passes(m({}))).toBe(true);
  });
});

describe('renderMarkdown', () => {
  it('puts both slowdowns of a metric on one row and marks the budget outcome', () => {
    const table = renderMarkdown(
      [
        m({ budget: 55, atLeast: true, value: 60 }),
        m({ budget: 55, atLeast: true, value: 41, cpuSlowdown: 4 }),
        m({ scenario: 'Memory', metric: 'peak', value: 812.4, unit: 'MB' }),
      ],
      environment,
    );
    expect(table).toContain('| Scroll | fps | ≥ 55 fps | 60 fps ✓ | 41 fps ✗ |');
    expect(table).toContain('| Memory | peak |  | 812.4 MB | n/a |');
    expect(table).toContain('version 0.3.0 (commit abc1234)');
    expect(table.endsWith('\n')).toBe(true);
  });
});
