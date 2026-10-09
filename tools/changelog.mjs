// Builds CHANGELOG.md from the Conventional Commits between version tags.
// Run: node tools/changelog.mjs [--next v0.3.0]   (rewrites the whole file from git history;
// --next titles the commits since the last tag as that upcoming version).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const TITLES = {
  feat: 'Features',
  fix: 'Fixes',
  perf: 'Performance',
  test: 'Tests',
  build: 'Build',
  ci: 'CI',
  docs: 'Documentation',
  style: 'Style',
  refactor: 'Refactoring',
  chore: 'Chores',
};

const tags = git('tag', '--list', 'v*', '--sort=-version:refname').split('\n').filter(Boolean);
const ranges = [];
const newest = tags[0];
if (newest !== undefined && git('rev-list', '--count', `${newest}..HEAD`) !== '0') {
  const next = process.argv.indexOf('--next');
  const upcoming = next > 0 ? process.argv[next + 1] : undefined;
  const title =
    upcoming === undefined ? 'Unreleased' : `${upcoming} (${git('log', '-1', '--format=%as')})`;
  ranges.push({ title, from: newest, to: 'HEAD' });
}
tags.forEach((tag, index) => {
  const date = git('log', '-1', '--format=%as', tag);
  ranges.push({ title: `${tag} (${date})`, from: tags[index + 1], to: tag });
});

function section({ title, from, to }) {
  const range = from === undefined ? to : `${from}..${to}`;
  const subjects = git('log', range, '--no-merges', '--format=%s').split('\n').filter(Boolean);
  const groups = new Map();
  for (const subject of subjects) {
    const match = /^(\w+)(?:\(([^)]+)\))?!?: (.+)$/.exec(subject);
    const type = match?.[1] ?? 'chore';
    const text =
      match === null ? subject : `${match[2] === undefined ? '' : `**${match[2]}:** `}${match[3]}`;
    groups.set(type, [...(groups.get(type) ?? []), text]);
  }
  const lines = [`## ${title}`, ''];
  for (const [type, heading] of Object.entries(TITLES)) {
    const items = groups.get(type);
    if (items === undefined) continue;
    lines.push(`### ${heading}`, '', ...items.map((item) => `- ${item}`), '');
  }
  return lines.join('\n');
}

const body = [
  '# Changelog',
  '',
  'Generated from commit messages by `node tools/changelog.mjs`.',
  '',
  ...ranges.map(section),
];
writeFileSync(join(root, 'CHANGELOG.md'), `${body.join('\n').trimEnd()}\n`);
process.stdout.write(`Wrote CHANGELOG.md (${String(ranges.length)} sections)\n`);
