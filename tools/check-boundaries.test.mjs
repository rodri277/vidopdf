import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = join(root, '.dependency-cruiser.cjs');
const depcruise = join(root, 'node_modules', '.bin', 'depcruise');

function cruise(fixture) {
  return spawnSync(depcruise, ['.', '--config', config], {
    cwd: join(root, 'tools', 'fixtures', fixture),
    encoding: 'utf8',
  });
}

test('accepts imports that respect the layers', () => {
  const result = cruise('valid');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

const violations = [
  ['core-imports-react', 'core-imports-nothing-outside-itself'],
  ['core-imports-adapters', 'core-imports-nothing-outside-itself'],
  ['adapters-import-web', 'adapters-only-import-core-and-pdf-libs'],
  ['ui-imports-pdfjs', 'ui-never-imports-pdf-libs'],
  ['ui-imports-pdflib', 'ui-never-imports-pdf-libs'],
  ['ui-imports-adapters', 'pdf-work-only-in-workers'],
  ['ui-imports-adapters-package', 'pdf-work-only-in-workers'],
  ['circular', 'no-circular'],
];

for (const [fixture, rule] of violations) {
  test(`fails on ${fixture} with rule ${rule}`, () => {
    const result = cruise(fixture);
    assert.notEqual(result.status, 0, 'expected dependency-cruiser to fail');
    assert.match(result.stdout, new RegExp(rule));
  });
}
