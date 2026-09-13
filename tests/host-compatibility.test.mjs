import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyAliases } from '../.agents/skills/skills-host-compatibility/scripts/verify_aliases.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-compatibility-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
  return root;
}

test('classifies declared skills and guidance aliases without following them as inventory', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.claude'));
  fs.mkdirSync(path.join(root, '.github'));
  fs.mkdirSync(path.join(root, '.copilot', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Guidance\n');
  fs.writeFileSync(path.join(root, 'wrong-target.md'), '# Wrong guidance\n');
  fs.writeFileSync(path.join(root, 'GEMINI.md'), '# Undeclared guidance\n');
  fs.symlinkSync('../.agents/skills', path.join(root, '.claude', 'skills'), 'dir');
  fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'));
  fs.symlinkSync('missing.md', path.join(root, 'BROKEN.md'));
  fs.symlinkSync('wrong-target.md', path.join(root, 'WRONG.md'));
  fs.mkdirSync(path.join(root, '.copy', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.copy', 'skills', 'SKILL.md'), 'copy\n');
  fs.mkdirSync(path.join(root, 'PLAIN.md'));

  const report = verifyAliases({
    root,
    canonical_path: '.agents/skills',
    guidance_path: 'AGENTS.md',
    aliases: [
      { kind: 'skills', path: '.claude/skills', shape: 'symbolic-link', target: '../.agents/skills' },
      { kind: 'guidance', path: 'CLAUDE.md', shape: 'symbolic-link', target: 'AGENTS.md' },
      { kind: 'guidance', path: 'MISSING.md', shape: 'symbolic-link', target: 'AGENTS.md' },
      { kind: 'guidance', path: 'BROKEN.md', shape: 'symbolic-link', target: 'AGENTS.md' },
      { kind: 'guidance', path: 'WRONG.md', shape: 'symbolic-link', target: 'AGENTS.md' },
      { kind: 'skills', path: '.copy/skills', shape: 'symbolic-link', target: '../.agents/skills' },
      { kind: 'guidance', path: 'PLAIN.md', shape: 'symbolic-link', target: 'AGENTS.md' },
    ],
    observed_paths: ['.copilot/skills', 'GEMINI.md'],
  });

  assert.deepEqual(report.aliases.map(({ path: name, kind, disposition }) => [name, kind, disposition]), [
    ['.claude/skills', 'skills', 'present'],
    ['CLAUDE.md', 'guidance', 'present'],
    ['MISSING.md', 'guidance', 'missing'],
    ['BROKEN.md', 'guidance', 'broken'],
    ['WRONG.md', 'guidance', 'wrong-target'],
    ['.copy/skills', 'skills', 'duplicate-copy'],
    ['PLAIN.md', 'guidance', 'unsupported-shape'],
  ]);
  assert.deepEqual(report.observed, [
    { path: '.copilot/skills', disposition: 'not-declared' },
    { path: 'GEMINI.md', disposition: 'not-declared' },
  ]);
  assert.deepEqual(report.guidance, { path: 'AGENTS.md', disposition: 'present' });
});

test('rejects alias contracts that escape the supplied repository root', (t) => {
  const root = fixture(t);
  assert.throws(() => verifyAliases({
    root,
    canonical_path: '.agents/skills',
    aliases: [{ kind: 'skills', path: '.claude/skills', shape: 'symbolic-link', target: '../../outside' }],
  }), /escapes the root|does not resolve to canonical_path/);
});

test('requires a separate canonical guidance path for guidance aliases', (t) => {
  const root = fixture(t);
  assert.throws(() => verifyAliases({
    root,
    canonical_path: '.agents/skills',
    aliases: [{ kind: 'guidance', path: 'CLAUDE.md', shape: 'symbolic-link', target: 'AGENTS.md' }],
  }), /guidance_path is required/);
});
