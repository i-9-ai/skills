// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { renderSessionIndex } from '../src/domain/session-index-policy.mjs';
import { unavailableSessionIndex } from '../src/application/render-session-index.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function catalog(skills) {
  return { schema_version: 2, skills };
}

function skill(name, description = `Use ${name} for a focused test.`, status = 'pilot') {
  return { name, description, status };
}

test('session index puts routing first and discloses omitted packages', () => {
  const output = renderSessionIndex(catalog([
    skill('skill-authoring'), skill('skill-routing'), skill('skills-audit'), skill('skills-catalog'), skill('skills-discovery'),
  ]), { maxEntries: 3 });
  assert.match(output, /\*\*Start here:\*\* `skill-routing`/);
  assert.ok(output.indexOf('`skill-routing`') < output.indexOf('`skills-audit`'));
  assert.match(output, /2 additional catalogued packages are not shown/);
  assert.match(output, /Catalog: 5 packages \(5 pilot\)/);
});

test('session index excludes deprecated entry points and preserves bounded descriptions', () => {
  const output = renderSessionIndex(catalog([
    skill('skill-routing', 'x'.repeat(200)), skill('skills-audit'), skill('skills-discovery', 'deprecated', 'deprecated'),
  ]));
  assert.match(output, /…/);
  assert.doesNotMatch(output, /`skills-discovery` \(deprecated\)/);
  assert.match(output, /1 additional catalogued package is not shown/);
});

test('session index rejects invalid catalogs', () => {
  assert.throws(() => renderSessionIndex({ schema_version: 1, skills: [] }), /unsupported schema version/);
  assert.throws(() => renderSessionIndex(catalog([skill('skill-routing'), skill('skill-routing')])), /duplicate skill/);
  assert.throws(() => renderSessionIndex(catalog([skill('skill-routing')]), { maxEntries: 0 }), /entry limit/);
});

test('CLI session-index is a safe manual fallback', () => {
  const result = spawnSync(process.execPath, ['src/cli.mjs', 'session-index'], {
    cwd: repository, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# I-9 Skills session index/);
  assert.match(result.stdout, /`skill-routing`/);
});

test('Codex adapter invokes the same bounded read-only renderer', () => {
  const adapter = JSON.parse(readFileSync(resolve(repository, '.codex', 'hooks.json'), 'utf8'));
  const entry = adapter.hooks.SessionStart[0];
  const command = entry.hooks[0];
  assert.equal(entry.matcher, 'startup|resume|clear|compact');
  assert.match(command.command, /src\/cli\.mjs" session-index$/);
  assert.equal(command.additionalContextLimit, 1200);
  assert.match(unavailableSessionIndex(), /catalog\.json/);
});
