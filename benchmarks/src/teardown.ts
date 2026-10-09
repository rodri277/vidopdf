import { chromium } from '@playwright/test';
import { writeReport } from './report';

export default async function teardown(): Promise<void> {
  const browser = await chromium.launch();
  const version = `Chromium ${browser.version()}`;
  await browser.close();
  writeReport(version);
  process.stdout.write('Wrote benchmarks/RESULTS.md\n');
}
