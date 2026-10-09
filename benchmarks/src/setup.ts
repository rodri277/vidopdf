import { rmSync } from 'node:fs';
import { rawResults } from './harness';
import { ensureFixtures } from './fixtures';

export default async function setup(): Promise<void> {
  rmSync(rawResults, { force: true });
  process.stdout.write('Generating benchmark documents if they are missing...\n');
  await ensureFixtures();
}
