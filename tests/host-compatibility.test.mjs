import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyAliases } from '../.agents/skills/skills-host-compatibility/scripts/verify_aliases.mjs';

function fixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'host-compatibility-test-')));
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

test('rejects intermediate and followed symlink escapes from the supplied repository root', (t) => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'host-compatibility-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.mkdirSync(path.join(outside, 'skills'));
  fs.symlinkSync(outside, path.join(root, '.escaped'), 'dir');
  assert.throws(() => verifyAliases({ root, canonical_path: '.escaped/skills', aliases: [] }), /escapes the root/);

  fs.symlinkSync('.agents/skills', path.join(root, '.claude'), 'dir');
  fs.symlinkSync(outside, path.join(root, '.claude', 'external'), 'dir');
  assert.throws(() => verifyAliases({
    root,
    canonical_path: '.agents/skills',
    aliases: [{ kind: 'skills', path: '.claude/external', shape: 'symbolic-link', target: '.' }],
  }), /escapes the root/);
  assert.throws(() => verifyAliases({
    root, canonical_path: '.agents/skills', aliases: [], observed_paths: ['.claude/external'],
  }), /escapes the root/);
});

test('runs directly when the helper script path contains a space', (t) => {
  const root = fixture(t);
  const helperDirectory = path.join(root, 'helper with space');
  fs.mkdirSync(helperDirectory);
  const source = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.agents', 'skills', 'skills-host-compatibility', 'scripts', 'verify_aliases.mjs');
  const helper = path.join(helperDirectory, 'verify aliases.mjs');
  fs.copyFileSync(source, helper);
  const contract = path.join(root, 'contract.json');
  fs.writeFileSync(contract, JSON.stringify({ root, canonical_path: '.agents/skills', aliases: [] }));
  const result = spawnSync(process.execPath, [helper, contract], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    canonical: { path: '.agents/skills', disposition: 'present' }, guidance: null, aliases: [], observed: [],
  });
});
