import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = new URL('../scripts/skills_snapshot.mjs', import.meta.url).pathname;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-snapshot-test-'));
  const source = path.join(root, 'active-skills');
  const store = path.join(root, 'snapshot-store');
  fs.mkdirSync(path.join(source, 'alpha', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(source, 'beta'), { recursive: true });
  fs.writeFileSync(path.join(source, 'alpha', 'SKILL.md'), '# Alpha\n');
  fs.writeFileSync(path.join(source, 'alpha', 'assets', 'data.txt'), 'stable bytes\n');
  fs.writeFileSync(path.join(source, 'beta', 'SKILL.md'), '# Beta\n');
  fs.symlinkSync('alpha', path.join(source, 'alpha-projection'));
  fs.mkdirSync(store);
  return { root, source, store };
}

function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8' });
  assert.equal(result.status, expected, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
  return result;
}

function json(result) {
  return JSON.parse(result.stdout);
}

test('collection manifests are deterministic and inventory links without following them', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const projection = path.join(f.root, 'consumer-alpha');
  fs.symlinkSync(path.join(f.source, 'alpha'), projection);
  for (const name of ['one', 'two']) {
    run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', name, '--projection', `consumer=${projection}`]);
  }
  const first = fs.readFileSync(path.join(f.store, 'one', 'manifest.json'));
  const second = fs.readFileSync(path.join(f.store, 'two', 'manifest.json'));
  assert.deepEqual(first, second);
  const manifest = JSON.parse(first);
  assert.equal(manifest.links.source.length, 1);
  assert.equal(manifest.links.source[0].path, 'alpha-projection');
  assert.equal(manifest.links.projections[0].label, 'consumer');
  assert.equal(manifest.links.projections[0].relation_to_source, 'inside-source');
  assert.equal(manifest.links.projections[0].link_target, '<absolute-redacted>');
  assert.equal(fs.lstatSync(path.join(f.store, 'one', 'content', 'alpha-projection')).isSymbolicLink(), true);
});

test('create rejects a store inside the selected source', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const result = run(['create', '--source', f.source, '--store', path.join(f.source, 'snapshots'), '--scope', 'collection', '--name', 'bad'], 1);
  assert.match(result.stderr, /must not overlap/);
});

test('create rejects conventional credentials and private-key material', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(f.source, 'alpha', '.env'), ['TO', 'KEN=synthetic\n'].join(''));
  let result = run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'sensitive'], 1);
  assert.match(result.stderr, /Sensitive material path/);
  fs.rmSync(path.join(f.source, 'alpha', '.env'));
  fs.writeFileSync(path.join(f.source, 'alpha', 'sample.txt'), ['-----BEGIN ', 'PRIVATE KEY-----\nsynthetic\n'].join(''));
  result = run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'private-key'], 1);
  assert.match(result.stderr, /Private-key material/);
});

test('verify detects changed snapshot content', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'clean']);
  fs.appendFileSync(path.join(f.store, 'clean', 'content', 'alpha', 'SKILL.md'), 'tampered\n');
  const result = run(['verify', '--snapshot', path.join(f.store, 'clean')], 2);
  assert.equal(json(result).ok, false);
  assert.equal(json(result).checks.content_entries, false);
});

test('package restore replaces only the chosen package and retains rollback outside discovery', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'whole']);
  fs.writeFileSync(path.join(f.source, 'alpha', 'SKILL.md'), '# Changed Alpha\n');
  fs.writeFileSync(path.join(f.source, 'beta', 'SKILL.md'), '# Changed Beta\n');
  const result = json(run(['restore', '--snapshot', path.join(f.store, 'whole'), '--target', f.source, '--scope', 'package', '--package', 'alpha', '--replace']));
  assert.equal(fs.readFileSync(path.join(f.source, 'alpha', 'SKILL.md'), 'utf8'), '# Alpha\n');
  assert.equal(fs.readFileSync(path.join(f.source, 'beta', 'SKILL.md'), 'utf8'), '# Changed Beta\n');
  assert.match(result.restored_content_tree_hash, /^[0-9a-f]{64}$/);
  assert.match(result.source_snapshot_tree_hash, /^[0-9a-f]{64}$/);
  assert.equal(path.dirname(path.dirname(result.rollback)), f.root);
  assert.equal(fs.readFileSync(path.join(result.rollback, 'SKILL.md'), 'utf8'), '# Changed Alpha\n');
});

test('collection restore replaces the full collection and retains rollback', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'whole']);
  fs.rmSync(path.join(f.source, 'beta'), { recursive: true });
  fs.mkdirSync(path.join(f.source, 'gamma'));
  fs.writeFileSync(path.join(f.source, 'gamma', 'SKILL.md'), '# Gamma\n');
  const result = json(run(['restore', '--snapshot', path.join(f.store, 'whole'), '--target', f.source, '--scope', 'collection', '--replace']));
  assert.equal(fs.existsSync(path.join(f.source, 'beta', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(f.source, 'gamma')), false);
  assert.equal(fs.existsSync(path.join(result.rollback, 'gamma', 'SKILL.md')), true);
});

test('package snapshots restore their matching package', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  run(['create', '--source', f.source, '--store', f.store, '--scope', 'package', '--package', 'alpha', '--name', 'alpha-only']);
  fs.writeFileSync(path.join(f.source, 'alpha', 'SKILL.md'), '# Changed Alpha\n');
  run(['restore', '--snapshot', path.join(f.store, 'alpha-only'), '--target', f.source, '--scope', 'package', '--package', 'alpha', '--replace']);
  assert.equal(fs.readFileSync(path.join(f.source, 'alpha', 'SKILL.md'), 'utf8'), '# Alpha\n');
});

test('prune previews without mutation and apply moves selected snapshots to trash', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  for (const name of ['snapshot-a', 'snapshot-b', 'snapshot-c']) {
    run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', name]);
  }
  const preview = json(run(['prune', '--store', f.store, '--keep', '1']));
  assert.equal(preview.selected.length, 2);
  assert.equal(preview.moved.length, 0);
  assert.equal(fs.readdirSync(f.store).filter(name => name.startsWith('snapshot-')).length, 3);
  const applied = json(run(['prune', '--store', f.store, '--keep', '1', '--apply']));
  assert.equal(applied.moved.length, 2);
  assert.equal(fs.readdirSync(f.store).filter(name => name.startsWith('snapshot-')).length, 1);
  assert.equal(fs.readdirSync(path.join(f.store, '.trash')).length, 2);
});

test('list reports only complete snapshots', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'listed']);
  fs.mkdirSync(path.join(f.store, '.partial'));
  const result = json(run(['list', '--store', f.store, '--json']));
  assert.deepEqual(result.snapshots.map(item => item.name), ['listed']);
});
