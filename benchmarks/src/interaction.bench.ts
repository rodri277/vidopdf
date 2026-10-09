import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { files } from './fixtures';
import { SLOWDOWNS, loadDocuments, openApp, record, throttle, waitForThumbnails } from './harness';
import { median, percentile, round } from './stats';

test.setTimeout(10 * 60_000);

interface Key {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
}

/**
 * Time from a key press reaching the grid until the screen has been painted with its result: the
 * event is dispatched in the page and the clock stops two animation frames later, so about 33 ms
 * of it is the browser waiting for its next two frames, however little work was done.
 */
async function timeKey(page: Page, key: Key): Promise<{ painted: number; handler: number }> {
  return page.evaluate(async (init) => {
    // With every page deleted there is no grid; shortcuts such as undo still listen on the window.
    const target = document.getElementById('page-grid') ?? document.body;
    const started = performance.now();
    target.dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }),
    );
    // What the handler and the synchronous render cost, before the browser gets to paint.
    const handler = performance.now() - started;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    return { painted: performance.now() - started, handler };
  }, key);
}

const UNDO: Key = { key: 'z', ctrlKey: true };
const REDO: Key = { key: 'z', ctrlKey: true, shiftKey: true };
const REPEATS = 10;

async function selectFirst(page: Page, count: number): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('page-grid')?.scrollTo(0, 0);
  });
  await page.getByRole('option').first().click();
  if (count === 1) return;
  if (count >= 1000) {
    await page.keyboard.press('ControlOrMeta+a');
    return;
  }
  for (let page_ = 1; page_ < count; page_++) await page.keyboard.press('Shift+ArrowRight');
}

for (const slowdown of SLOWDOWNS) {
  test(`reordering, rotating and deleting in a 1000-page document, CPU ${String(slowdown)}x slower`, async ({
    page,
  }) => {
    await openApp(page);
    await throttle(page, slowdown);
    await loadDocuments(page, [files.text1000], 1000);
    await waitForThumbnails(page);

    const cases: readonly { name: string; pages: number; action: Key; label: string }[] = [
      { name: 'Rotate', pages: 1, action: { key: 'r' }, label: '1 page' },
      { name: 'Rotate', pages: 100, action: { key: 'r' }, label: '100 pages' },
      { name: 'Rotate', pages: 1000, action: { key: 'r' }, label: '1000 pages' },
      {
        name: 'Move to the end',
        pages: 100,
        action: { key: 'End', altKey: true },
        label: '100 pages',
      },
      { name: 'Delete', pages: 100, action: { key: 'Delete' }, label: '100 pages' },
      { name: 'Delete', pages: 1000, action: { key: 'Delete' }, label: '1000 pages' },
    ];
    for (const { name, pages, action, label } of cases) {
      await selectFirst(page, pages);
      const done: number[] = [];
      const handled: number[] = [];
      const undone: number[] = [];
      for (let run = 0; run < REPEATS; run++) {
        const result = await timeKey(page, action);
        done.push(result.painted);
        handled.push(result.handler);
        undone.push((await timeKey(page, UNDO)).painted);
        // Redo then undo again keeps the selection and the document as they were.
        await timeKey(page, REDO);
        await timeKey(page, UNDO);
      }
      const base = {
        scenario: `${name}, ${label}, in a 1000-page document`,
        cpuSlowdown: slowdown,
      };
      record({
        ...base,
        metric: 'median time to the painted result',
        value: round(median(done)),
        unit: 'ms',
        budget: 100,
      });
      record({
        ...base,
        metric: 'of which the handler and render',
        value: round(median(handled), 2),
        unit: 'ms',
      });
      record({
        ...base,
        metric: '95th percentile',
        value: round(percentile(done, 0.95)),
        unit: 'ms',
        budget: 100,
      });
      record({
        scenario: `Undo of "${name.toLowerCase()}", ${label}, in a 1000-page document`,
        metric: 'median time to the painted result',
        value: round(median(undone)),
        unit: 'ms',
        budget: 100,
        cpuSlowdown: slowdown,
      });
    }
  });
}
