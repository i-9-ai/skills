// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { renderSessionIndex } from '../src/domain/session-index-policy.mjs';
import { renderRepositorySessionIndex, unavailableSessionIndex } from '../src/application/render-session-index.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function catalog(skills) {
  return { schema_version: 2, skills };
}

function skill(name, description = `Use ${name} for a focused test.`, status = 'pilot') {
  return catalogSkill(name, description, status);
}

function catalogSkill(name, description, status = 'pilot') {
  return {
    name,
    path: `.agents/skills/${name}`,
    status,
    description: description ?? `Use ${name} for a focused test.`,
    tags: [],
  };
}

test('session index puts routing first and discloses omitted packages', () => {
  const output = renderSessionIndex(catalog([
    skill('skill-authoring'), skill('skill-routing'), skill('skills-audit'), skill('skills-catalog'), skill('skills-discovery'),
  ]), { maxEntries: 3 });
  assert.match(output, /\*\*Start here:\*\* `skill-routing`/);
  const entryList = output.slice(output.indexOf('Recommended entry points:'));
  assert.ok(entryList.indexOf('`skill-routing`') < entryList.indexOf('`skills-audit`'));
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
  assert.throws(() => renderSessionIndex(catalog([])), /between 1 and 256 packages/);
  assert.throws(() => renderSessionIndex(catalog([skill('skill-routing'), skill('skill-routing')])), /duplicate skill/);
  assert.throws(() => renderSessionIndex(catalog([skill('skill-routing')]), { maxEntries: 0 }), /entry limit/);
});

test('session index rejects catalog entries outside repository bounds before rendering', () => {
  assert.throws(() => renderSessionIndex(catalog(Array.from({ length: 257 }, (_, index) =>
    catalogSkill(`skill-${index}`)))), /between 1 and 256 packages/);
  assert.throws(() => renderSessionIndex(catalog([catalogSkill('a'.repeat(65))])), /at most 64 characters/);
  assert.throws(() => renderSessionIndex(catalog([catalogSkill('skill-routing', 'x'.repeat(221))])), /at most 220 characters/);
  assert.throws(() => renderSessionIndex(catalog([catalogSkill('skill-routing', 'Unsafe\u0007 description')])), /control characters/);
  assert.throws(() => renderSessionIndex(catalog([{ ...catalogSkill('skill-routing'), extra: true }])), /missing or unexpected fields/);
});

test('CLI session-index is a safe manual fallback', () => {
  const result = spawnSync(process.execPath, ['src/cli.mjs', 'session-index'], {
    cwd: repository, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# I-9 Skills session index/);
  assert.match(result.stdout, /`skill-routing`/);
});

test('CLI session-index fails open when its fixture catalog is malformed', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'i9-session-index-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  cpSync(resolve(repository, 'src'), join(fixture, 'src'), { recursive: true });
  cpSync(resolve(repository, '.agents'), join(fixture, '.agents'), { recursive: true });
  writeFileSync(join(fixture, 'catalog.json'), '{not-json', 'utf8');

  const result = spawnSync(process.execPath, ['src/cli.mjs', 'session-index'], {
    cwd: fixture, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, unavailableSessionIndex());
});

test('session index rejects an oversized catalog before reading it', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'i9-session-index-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  writeFileSync(join(fixture, 'catalog.json'), 'x'.repeat(1_048_577), 'utf8');
  assert.throws(() => renderRepositorySessionIndex(fixture), /bounded regular file/);
});

test('session index bounds its opened catalog read before decoding', () => {
  const source = readFileSync(resolve(repository, 'src/application/render-session-index.mjs'), 'utf8');
  assert.match(source, /Buffer\.alloc\(MAX_CATALOG_BYTES \+ 1\)[\s\S]*readSync\(descriptor, bytes[\s\S]*catalog exceeds the read limit/);
});

test('session index rejects a catalog hard link before reading external bytes', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'i9-session-index-')); const outside = join(tmpdir(), `catalog-outside-${Date.now()}.json`);
  t.after(() => { rmSync(fixture, { recursive: true, force: true }); rmSync(outside, { force: true }); });
  writeFileSync(outside, JSON.stringify(catalog([skill('skill-routing')]))); linkSync(outside, join(fixture, 'catalog.json'));
  assert.throws(() => renderRepositorySessionIndex(fixture), /bounded regular file/);
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
