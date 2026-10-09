import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { files } from './fixtures';
import {
  SLOWDOWNS,
  loadDocuments,
  openApp,
  record,
  startMonitor,
  stopMonitor,
  throttle,
  waitForThumbnails,
} from './harness';
import { round } from './stats';

test.setTimeout(10 * 60_000);

/** Moves the grid at a constant speed for `ms`, frame by frame, as a finger or a wheel would. */
async function scrollAt(page: Page, pxPerSecond: number, ms: number): Promise<void> {
  await page.evaluate(
    async ({ speed, duration }) => {
      const grid = document.getElementById('page-grid');
      if (grid === null) throw new Error('no grid');
      await new Promise<void>((resolve) => {
        const start = performance.now();
        let last = start;
        const step = (now: number) => {
          grid.scrollTop += ((now - last) / 1000) * speed;
          last = now;
          if (now - start < duration) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    { speed: pxPerSecond, duration: ms },
  );
}

/** Milliseconds until every card in view has its thumbnail drawn. */
async function settleThumbnails(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const grid = document.getElementById('page-grid');
    if (grid === null) throw new Error('no grid');
    const started = performance.now();
    const missing = () =>
      [...grid.querySelectorAll('[role="option"]')].filter((card) => {
        const box = card.getBoundingClientRect();
        const view = grid.getBoundingClientRect();
        return (
          box.bottom > view.top && box.top < view.bottom && card.querySelector('canvas') === null
        );
      }).length;
    while (missing() > 0 && performance.now() - started < 30_000) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return performance.now() - started;
  });
}

for (const slowdown of SLOWDOWNS) {
  test(`scrolling a 1000-page document, CPU ${String(slowdown)}x slower`, async ({ page }) => {
    await openApp(page);
    await throttle(page, slowdown);
    await loadDocuments(page, [files.text1000], 1000);
    await waitForThumbnails(page);

    for (const [name, speed, ms] of [
      ['steady scroll (2400 px/s)', 2400, 6000],
      ['fast fling (12000 px/s)', 12_000, 3000],
    ] as const) {
      await page.evaluate(() => {
        document.getElementById('page-grid')?.scrollTo(0, 0);
      });
      await settleThumbnails(page);
      await startMonitor(page);
      await scrollAt(page, speed, ms);
      // Straight after the scroll stops, before anything has had time to catch up.
      const settled = await settleThumbnails(page);
      const report = await stopMonitor(page);
      const base = { scenario: `Scroll, 1000 pages, ${name}`, cpuSlowdown: slowdown };
      record({
        ...base,
        metric: 'frames per second',
        value: round(report.frames.fps),
        unit: 'fps',
        budget: 58,
        atLeast: true,
      });
      record({
        ...base,
        metric: '95th percentile frame',
        value: round(report.frames.p95Ms),
        unit: 'ms',
      });
      record({
        ...base,
        metric: 'frames over 20 ms',
        value: report.frames.slowFrames,
        unit: 'frames',
      });
      record({
        ...base,
        metric: 'long tasks (over 50 ms)',
        value: report.longTasks,
        unit: 'tasks',
        budget: 0,
      });
      record({
        ...base,
        metric: 'longest task',
        value: round(report.longestTaskMs),
        unit: 'ms',
        budget: 50,
      });
      record({
        ...base,
        metric: 'thumbnails of the final view drawn after',
        value: round(settled),
        unit: 'ms',
      });
      expect(report.frames.frames).toBeGreaterThan(10);
    }
  });

  test(`first thumbnails of a 300 and a 1000-page document, CPU ${String(slowdown)}x slower`, async ({
    page,
  }) => {
    await openApp(page);
    await throttle(page, slowdown);
    const started = Date.now();
    await loadDocuments(page, [files.text1000], 1000);
    await waitForThumbnails(page);
    record({
      scenario: 'Open a 1000-page document',
      metric: 'until the first thumbnails are visible',
      value: Date.now() - started,
      unit: 'ms',
      cpuSlowdown: slowdown,
    });
  });
}
