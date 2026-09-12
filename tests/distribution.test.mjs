/** Exercise copied packages without their source checkout or a consumer installation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SOURCE_PACKAGES = fileURLToPath(new URL('../.agents/skills/', import.meta.url));

function setWritable(directory, writable) {
  if (writable) fs.chmodSync(directory, 0o755);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) setWritable(filename, writable);
    else fs.chmodSync(filename, writable ? 0o644 : 0o444);
  }
  if (!writable) fs.chmodSync(directory, 0o555);
}

function fixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-distribution-test-')));
  t.after(() => { setWritable(root, true); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}

function snapshot(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'copied package must not contain aliases');
    if (entry.isDirectory()) {
      files.push([entry.name, 'directory']);
      for (const [relative, value] of snapshot(filename)) files.push([`${entry.name}/${relative}`, value]);
    } else files.push([entry.name, fs.readFileSync(filename)]);
  }
  return files.sort(([left], [right]) => left.localeCompare(right));
}

function invoke(helper, args, cwd) {
  const result = spawnSync(process.execPath, [helper, ...args], {
    cwd, encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const scope of ['project', 'global']) {
  test(`creator works from a read-only ${scope} package with separate outputs and an installed alias`, t => {
    const root = fixture(t);
    const installation = path.join(root, 'installation', scope, 'skill-authoring');
    fs.cpSync(path.join(SOURCE_PACKAGES, 'skill-authoring'), installation, { recursive: true });
    const before = snapshot(installation);
    setWritable(installation, false);

    const caller = path.join(root, 'unrelated project'); fs.mkdirSync(caller);
    fs.writeFileSync(path.join(caller, 'package.json'), '{"name":"unrelated-consumer","type":"commonjs"}\n');
    const callerBefore = snapshot(caller);
    const outputParent = path.join(root, 'chosen output'); fs.mkdirSync(outputParent);
    const helper = path.join(installation, 'scripts', 'skill_tools.mjs');
    const candidate = path.join(outputParent, 'detached-skill');

    assert.equal(invoke(helper, ['init', 'detached-skill', '--output', outputParent, '--with-openai'], caller).created, candidate);
    assert.equal(invoke(helper, ['validate-skill', candidate], caller).name, 'detached-skill');
    assert.deepEqual(fs.readFileSync(path.join(candidate, 'LICENSE')), fs.readFileSync(path.join(installation, 'LICENSE')));
    assert.deepEqual(fs.readFileSync(path.join(candidate, 'assets/icon.svg')), fs.readFileSync(path.join(installation, 'assets/icon.svg')));

    const run = path.join(root, 'chosen run');
    fs.cpSync(path.join(installation, 'examples/merge-run'), run, { recursive: true });
    const runBefore = snapshot(run);
    assert.equal(invoke(helper, ['validate-run', path.join(run, 'run.json')], caller).run_id, 'merge-example');

    const registry = path.join(root, 'host registry'); fs.mkdirSync(registry);
    const alias = path.join(registry, 'skill-authoring');
    fs.symlinkSync(path.relative(registry, installation), alias, 'dir');
    const aliasHelper = path.join(alias, 'scripts', 'skill_tools.mjs');
    assert.equal(invoke(aliasHelper, ['init', 'alias-skill', '--output', outputParent], caller).created,
      path.join(outputParent, 'alias-skill'));
    assert.equal(invoke(aliasHelper, ['validate-skill', fs.realpathSync.native(alias)], caller).name, 'skill-authoring');

    assert.deepEqual(snapshot(installation), before);
    assert.deepEqual(snapshot(caller), callerBefore);
    assert.deepEqual(snapshot(run), runBefore);
    assert.deepEqual(fs.readdirSync(path.dirname(installation)), ['skill-authoring']);
  });
}

test('every package keeps its local resources valid when exported without repository files or siblings', t => {
  const root = fixture(t);
  const creator = path.join(root, 'validator', 'skill-authoring');
  fs.cpSync(path.join(SOURCE_PACKAGES, 'skill-authoring'), creator, { recursive: true });
  const helper = path.join(creator, 'scripts', 'skill_tools.mjs');
  const caller = path.join(root, 'caller'); fs.mkdirSync(caller);
  const packages = fs.readdirSync(SOURCE_PACKAGES, { withFileTypes: true }).filter(entry => entry.isDirectory());
  assert.ok(packages.length > 0);
  for (const { name } of packages) {
    const parent = path.join(root, 'exports', name);
    const isolated = path.join(parent, name);
    fs.cpSync(path.join(SOURCE_PACKAGES, name), isolated, { recursive: true });
    const before = snapshot(isolated);
    const result = invoke(helper, ['validate-skill', isolated], caller);
    assert.equal(result.name, name);
    assert.deepEqual(snapshot(isolated), before);
    assert.deepEqual(fs.readdirSync(parent), [name]);
  }
});
