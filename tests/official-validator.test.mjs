// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { officialRequirements } from '../src/domain/official-validator-policy.mjs';
import { canonicalSkills, installOfficialValidator, readOfficialConfiguration,
  runOfficialValidator } from '../src/infrastructure/official-validator-process.mjs';

const config = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .config.officialSkillValidator;

function fixture(t, names = ['second-skill', 'first-skill']) {
  const root = mkdtempSync(join(tmpdir(), 'official-skill-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const container = join(root, '.agents', 'skills');
  mkdirSync(container, { recursive: true });
  for (const name of names) {
    mkdirSync(join(container, name));
    writeFileSync(join(container, name, 'SKILL.md'), 'Synthetic invocation fixture.\n');
  }
  return { root, container };
}

test('derives the official source and hash-locked phases from package.json only', (t) => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ config: { officialSkillValidator: config } }));
  const requirements = officialRequirements(readOfficialConfiguration(root));
  assert.equal(requirements.version, config.version);
  assert.ok(requirements.phases[1].content.includes(`${config.source}#subdirectory=skills-ref`));
  assert.ok(requirements.phases[1].content.includes(config.sha256));
  assert.equal(requirements.phases[0].content.trim().split('\n').length, config.wheels.length);
  for (const wheel of config.wheels) assert.ok(requirements.phases[0].content.includes(wheel.sha256));
});

test('rejects unpinned source identity, duplicate dependencies, and argument-like versions', () => {
  assert.throws(() => officialRequirements({ ...config, source: 'https://example.org/skills-ref' }), /pinned/);
  assert.throws(() => officialRequirements({ ...config, sha256: 'unknown' }), /pinned/);
  assert.throws(() => officialRequirements({ ...config, version: `${config.version}\n` }), /pinned/);
  assert.throws(() => officialRequirements({ ...config, version: 1 }), /pinned/);
  assert.throws(() => officialRequirements({ ...config, sha256: `${config.sha256}\n` }), /pinned/);
  assert.throws(() => officialRequirements({ ...config, wheels: [...config.wheels, config.wheels[0]] }), /unique/);
  const wheels = [{ ...config.wheels[0], version: '1 --extra-index-url=https://example.org' }];
  assert.throws(() => officialRequirements({ ...config, wheels }), /unique/);
});

test('validates every canonical package using argument arrays and aggregates failures', (t) => {
  const { root, container } = fixture(t);
  const calls = [];
  const results = runOfficialValidator(root, canonicalSkills(root), config.version, (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === '--version') return { status: 0, stdout: `skills-ref, version ${config.version}\n` };
    return { status: args[1].endsWith('second-skill') ? 1 : 0, stderr: 'fixture result' };
  });
  assert.deepEqual(results.map(({ name, passed }) => ({ name, passed })), [
    { name: 'first-skill', passed: true }, { name: 'second-skill', passed: false },
  ]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].command, join(root, '.work', 'validation-env', 'bin', 'skills-ref'));
  assert.deepEqual(calls[1].args, ['validate', join(container, 'first-skill')]);
  assert.equal(calls[1].options.shell, false);
  assert.equal(calls[1].options.timeout, 30_000);
});

test('missing official executable or wrong version is a failure, never a silent skip', (t) => {
  const { root } = fixture(t, ['one-skill']);
  assert.throws(() => runOfficialValidator(root, canonicalSkills(root), config.version,
    () => ({ status: null, error: new Error('ENOENT') })), /unavailable/);
  assert.throws(() => runOfficialValidator(root, canonicalSkills(root), config.version,
    () => ({ status: 0, stdout: 'skills-ref, version 99.0.0' })), /version/);
});

test('does not discover aliases or scratch as additional skills', (t) => {
  const { root } = fixture(t, ['one-skill']);
  mkdirSync(join(root, '.github'));
  symlinkSync('../.agents/skills', join(root, '.github', 'skills'));
  mkdirSync(join(root, '.work', 'extra-skill'), { recursive: true });
  writeFileSync(join(root, '.work', 'extra-skill', 'SKILL.md'), 'scratch\n');
  assert.equal(canonicalSkills(root).length, 1);
});

test('rejects canonical symlinks, empty collections, and shell-like directory names', (t) => {
  const { root, container } = fixture(t, []);
  assert.throws(() => canonicalSkills(root), /No canonical/);
  symlinkSync(root, join(container, 'unsafe-skill'));
  assert.throws(() => canonicalSkills(root), /symlink/);
  const malicious = fixture(t, ['bad;echo-unsafe']);
  assert.throws(() => canonicalSkills(malicious.root), /Invalid/);
  const newline = fixture(t, ['one-skill\n']);
  assert.throws(() => canonicalSkills(newline.root), /Invalid/);
});

test('installs in ordered hash-checked phases and removes temporary files', (t) => {
  const { root } = fixture(t);
  const calls = [];
  installOfficialValidator(root, officialRequirements(config), (command, args, options) => {
    calls.push({ command, args, options,
      content: args.includes('-r') ? readFileSync(args.at(-1), 'utf8') : null });
    return { status: 0 };
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].command, join(root, '.work', 'validation-env', 'bin', 'python'));
  assert.equal(calls[0].args[0], '-I');
  assert.match(calls[0].args[2], /sys.prefix != sys.base_prefix/);
  assert.doesNotMatch(calls[1].content, /skills-ref @/);
  assert.match(calls[2].content, /skills-ref @/);
  assert.ok(calls[1].args.includes('--only-binary=:all:'));
  assert.ok(calls[2].args.includes('--no-build-isolation'));
  assert.ok(calls[2].args.includes('--no-deps'));
  for (const call of calls.slice(1)) {
    assert.deepEqual(call.args.slice(0, 3), ['-I', '-m', 'pip']);
    assert.ok(call.args.includes('--require-hashes'));
    assert.equal(call.options.shell, false);
    assert.equal(existsSync(call.args.at(-1)), false);
  }
});

test('failed bootstrap stops source installation and still cleans up', (t) => {
  const { root } = fixture(t);
  let calls = 0;
  let temporaryFile;
  assert.throws(() => installOfficialValidator(root, officialRequirements(config), (_command, args) => {
    calls += 1;
    if (calls === 1) return { status: 0 };
    temporaryFile = args.at(-1);
    return { status: 1 };
  }), /setup failed/);
  assert.equal(calls, 2);
  assert.equal(existsSync(temporaryFile), false);
});

test('a non-venv interpreter stops before installation', (t) => {
  const { root } = fixture(t);
  let calls = 0;
  assert.throws(() => installOfficialValidator(root, officialRequirements(config), () => {
    calls += 1;
    return { status: 1 };
  }), /setup failed/);
  assert.equal(calls, 1);
});
