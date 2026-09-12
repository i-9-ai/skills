// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateSkills } from '../scripts/validate_skills.mjs';
import { installValidation } from '../scripts/install_validation.mjs';

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

test('validates every canonical package using argument arrays and aggregates failures', (t) => {
  const { root, container } = fixture(t);
  const calls = [];
  const results = validateSkills(root, (command, args, options) => {
    calls.push({ command, args, options });
    return { status: args[1].endsWith('second-skill') ? 1 : 0, stderr: 'fixture result' };
  });
  assert.deepEqual(results.map(({ name, passed }) => ({ name, passed })), [
    { name: 'first-skill', passed: true }, { name: 'second-skill', passed: false },
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'skills-ref');
  assert.deepEqual(calls[0].args, ['validate', join(container, 'first-skill')]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.timeout, 30_000);
});

test('missing official executable is a failure, never a silent skip', (t) => {
  const { root } = fixture(t, ['one-skill']);
  const results = validateSkills(root, () => ({ status: null, error: new Error('ENOENT') }));
  assert.equal(results[0].passed, false);
  assert.match(results[0].diagnostic, /unavailable/);
});

test('does not discover aliases or scratch as additional skills', (t) => {
  const { root } = fixture(t, ['one-skill']);
  mkdirSync(join(root, '.github'));
  symlinkSync('../.agents/skills', join(root, '.github', 'skills'));
  mkdirSync(join(root, '.work', 'extra-skill'), { recursive: true });
  writeFileSync(join(root, '.work', 'extra-skill', 'SKILL.md'), 'scratch\n');
  assert.equal(validateSkills(root, () => ({ status: 0 })).length, 1);
});

test('rejects source symlinks before invoking the validator', (t) => {
  const { root, container } = fixture(t, []);
  symlinkSync(root, join(container, 'unsafe-skill'));
  assert.throws(() => validateSkills(root, () => assert.fail('must not execute')), /symlink/);
});

test('rejects an empty collection and shell-like directory names', (t) => {
  const { root } = fixture(t, []);
  assert.throws(() => validateSkills(root, () => assert.fail('must not execute')), /No canonical/);
  const malicious = fixture(t, ['bad;echo-unsafe']);
  assert.throws(() => validateSkills(malicious.root, () => assert.fail('must not execute')), /Invalid/);
});

const requirements = 'fixture-dependency==1 --hash=sha256:synthetic\n'
  + '# BEGIN OFFICIAL VALIDATOR SOURCE\nfixture-source @ https://example.org/source --hash=sha256:synthetic\n';

test('installs from one declaration in ordered hash-checked phases and removes temporary files', (t) => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'requirements.txt'), requirements);
  const calls = [];
  installValidation(root, (command, args, options) => {
    calls.push({ command, args, options,
      content: args.includes('-r') ? readFileSync(args.at(-1), 'utf8') : null });
    return { status: 0 };
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].command, join(root, '.work', 'validation-env', 'bin', 'python'));
  assert.match(calls[0].args[1], /sys.prefix != sys.base_prefix/);
  assert.match(calls[1].content, /fixture-dependency/);
  assert.doesNotMatch(calls[1].content, /fixture-source/);
  assert.match(calls[2].content, /fixture-source/);
  assert.ok(calls[1].args.includes('--only-binary=:all:'));
  assert.ok(calls[2].args.includes('--no-build-isolation'));
  assert.ok(calls[2].args.includes('--no-deps'));
  for (const call of calls.slice(1)) {
    assert.ok(call.args.includes('--require-hashes'));
    assert.equal(call.options.shell, false);
    assert.equal(existsSync(call.args.at(-1)), false);
  }
});

test('a failed bootstrap stops source installation and still cleans up', (t) => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'requirements.txt'), requirements);
  let calls = 0;
  let temporaryFile;
  assert.throws(() => installValidation(root, (_command, args) => {
    calls += 1;
    if (calls === 1) return { status: 0 };
    temporaryFile = args.at(-1);
    return { status: 1 };
  }), /setup failed/);
  assert.equal(calls, 2);
  assert.equal(existsSync(temporaryFile), false);
});

test('invalid requirements layout and a non-venv interpreter stop before installation', (t) => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'requirements.txt'), 'missing phase marker\n');
  assert.throws(() => installValidation(root, () => assert.fail('must not execute')), /must declare/);
  writeFileSync(join(root, 'requirements.txt'), requirements);
  let calls = 0;
  assert.throws(() => installValidation(root, () => { calls += 1; return { status: 1 }; }), /setup failed/);
  assert.equal(calls, 1);
});
