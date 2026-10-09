import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import type { Browser, CDPSession, Page } from '@playwright/test';
import { frameStats } from './stats';
import type { FrameStats } from './stats';

const here = dirname(fileURLToPath(import.meta.url));
export const resultsDir = join(here, '../results');
export const rawResults = join(resultsDir, 'raw.jsonl');

/** One measured value, with the budget it is held to when SPEC gives one. */
export interface Measurement {
  readonly scenario: string;
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  /** Upper bound the value must stay under (or lower bound when `atLeast`). */
  readonly budget?: number;
  readonly atLeast?: boolean;
  /** Slowdown of the CPU while measuring: 1 is the machine as it is. */
  readonly cpuSlowdown: number;
}

export function record(measurement: Measurement): void {
  mkdirSync(resultsDir, { recursive: true });
  appendFileSync(rawResults, `${JSON.stringify(measurement)}\n`);
}

export function passes(measurement: Measurement): boolean {
  if (measurement.budget === undefined) return true;
  return measurement.atLeast === true
    ? measurement.value >= measurement.budget
    : measurement.value <= measurement.budget;
}

/** CPU slowdowns the suite runs under. 4x approximates the mid-range laptop SPEC measures on. */
export const SLOWDOWNS = [1, 4] as const;

export async function throttle(page: Page, rate: number): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
  return session;
}

export async function openApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showSaveFilePicker');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Vidopdf' })).toBeVisible();
}

/** Loads documents and waits until the grid says how many pages it holds. */
export async function loadDocuments(
  page: Page,
  paths: readonly string[],
  expectedPages: number,
): Promise<number> {
  const started = Date.now();
  // Paths, not buffers: Playwright refuses to send files over 50 MB any other way.
  await page.getByTestId('file-input').setInputFiles([...paths]);
  await expect(page.getByText(new RegExp(`${String(expectedPages)} páginas`)).first()).toBeVisible({
    timeout: 120_000,
  });
  return Date.now() - started;
}

/** Waits for the thumbnails in view to be drawn (the first card has a canvas). */
export async function waitForThumbnails(page: Page): Promise<void> {
  await expect(page.getByRole('option').first().locator('canvas')).toBeVisible({ timeout: 60_000 });
}

// --- main-thread monitoring, running inside the page ---------------------------------------------

export interface MonitorReport {
  readonly frames: FrameStats;
  readonly longTasks: number;
  readonly longestTaskMs: number;
}

/** Starts recording animation frame gaps and long tasks (over 50 ms) on the main thread. */
export async function startMonitor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = {
      deltas: [] as number[],
      tasks: [] as number[],
      running: true,
      last: performance.now(),
    };
    const tick = (now: number) => {
      state.deltas.push(now - state.last);
      state.last = now;
      if (state.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.tasks.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
    (window as unknown as { __monitor: typeof state }).__monitor = state;
  });
}

export async function stopMonitor(page: Page): Promise<MonitorReport> {
  // Let the observer deliver entries it is holding.
  await page.waitForTimeout(150);
  const raw = await page.evaluate(() => {
    const state = (
      window as unknown as { __monitor: { deltas: number[]; tasks: number[]; running: boolean } }
    ).__monitor;
    state.running = false;
    return { deltas: state.deltas.slice(1), tasks: state.tasks };
  });
  return {
    frames: frameStats(raw.deltas),
    longTasks: raw.tasks.length,
    longestTaskMs: raw.tasks.length === 0 ? 0 : Math.max(...raw.tasks),
  };
}

// --- memory ----------------------------------------------------------------------------------------

interface ProcessInfo {
  readonly type: string;
  readonly id: number;
}

function rssBytes(pid: number): number {
  const kilobytes = Number(
    execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim(),
  );
  return Number.isFinite(kilobytes) ? kilobytes * 1024 : 0;
}

/**
 * Resident memory of the browser's renderer processes, which hold the page and its workers. It is
 * what the operating system sees, so it includes everything: JavaScript heaps, decoded images,
 * canvases. Works on macOS and Linux (it asks `ps`).
 */
export class MemoryProbe {
  private constructor(private readonly browserSession: CDPSession) {}

  static async create(browser: Browser): Promise<MemoryProbe> {
    return new MemoryProbe(await browser.newBrowserCDPSession());
  }

  async rendererBytes(): Promise<number> {
    const { processInfo } = (await this.browserSession.send('SystemInfo.getProcessInfo')) as {
      processInfo: ProcessInfo[];
    };
    return processInfo
      .filter((info) => info.type === 'renderer')
      .reduce((sum, info) => sum + rssBytes(info.id), 0);
  }

  /** Samples while `work` runs and returns the highest value seen. */
  async peakDuring<T>(work: () => Promise<T>, everyMs = 100): Promise<{ result: T; peak: number }> {
    let peak = await this.rendererBytes();
    const control = { running: true };
    const sampler = (async () => {
      while (control.running) {
        peak = Math.max(peak, await this.rendererBytes());
        await new Promise((resolve) => setTimeout(resolve, everyMs));
      }
    })();
    try {
      return { result: await work(), peak: Math.max(peak, await this.rendererBytes()) };
    } finally {
      control.running = false;
      await sampler;
    }
  }
}

export const MB = 1024 * 1024;
