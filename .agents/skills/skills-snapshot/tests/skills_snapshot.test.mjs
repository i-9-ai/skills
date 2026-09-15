import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { materializeTree } from '../scripts/snapshot_objects.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

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
  assert.equal(manifest.schema_version, 2);
  assert.equal(fs.existsSync(path.join(f.store, 'one', 'content')), false);
  const linkObject = path.join(f.store, '.objects', 'sha256', manifest.links.source[0].target_sha256);
  assert.equal(fs.readFileSync(linkObject, 'utf8'), 'alpha');
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
  const manifest = JSON.parse(fs.readFileSync(path.join(f.store, 'clean', 'manifest.json')));
  const hash = manifest.content.entries.find(entry => entry.path === 'alpha/SKILL.md').sha256;
  const object = path.join(f.store, '.objects', 'sha256', hash);
  fs.chmodSync(object, 0o600);
  fs.appendFileSync(object, 'tampered\n');
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

function create(f, name, extra = []) {
  return json(run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', name, ...extra]));
}
const manifestAt = (f, name) => JSON.parse(fs.readFileSync(path.join(f.store, name, 'manifest.json')));
const objectsAt = f => fs.readdirSync(path.join(f.store, '.objects', 'sha256')).filter(name => !name.startsWith('.')).sort();

test('unchanged snapshots reuse bytes; one edit adds one object; deletions preserve prior state', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const first = create(f, 'first');
  const originalObjects = objectsAt(f);
  assert.equal(first.new_objects, originalObjects.length);
  assert.equal(create(f, 'same').new_objects, 0);
  assert.deepEqual(objectsAt(f), originalObjects);
  fs.writeFileSync(path.join(f.source, 'alpha', 'assets', 'data.txt'), 'new bytes');
  assert.equal(create(f, 'edited').new_objects, 1);
  assert.equal(objectsAt(f).length, originalObjects.length + 1);
  fs.rmSync(path.join(f.source, 'beta'), { recursive: true });
  assert.equal(create(f, 'deleted').new_objects, 0);
  assert.equal(manifestAt(f, 'deleted').content.entries.some(entry => entry.path.startsWith('beta')), false);
  run(['restore', '--snapshot', path.join(f.store, 'first'), '--target', f.source, '--scope', 'collection', '--replace']);
  assert.equal(fs.readFileSync(path.join(f.source, 'beta', 'SKILL.md'), 'utf8'), '# Beta\n');
  assert.equal(fs.readFileSync(path.join(f.source, 'alpha', 'assets', 'data.txt'), 'utf8'), 'stable bytes\n');
  // Mutating restored bytes must never mutate the shared immutable object.
  fs.writeFileSync(path.join(f.source, 'alpha', 'SKILL.md'), 'mutable caller content');
  run(['verify', '--snapshot', path.join(f.store, 'first')]);
});

test('restores root/file/directory permissions and absolute/dangling link text', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.chmodSync(f.source, 0o750);
  fs.chmodSync(path.join(f.source, 'alpha'), 0o751);
  fs.chmodSync(path.join(f.source, 'alpha', 'SKILL.md'), 0o640);
  fs.symlinkSync('/synthetic/missing-target', path.join(f.source, 'absolute-link'));
  if (process.platform === 'darwin' && typeof fs.lchmodSync === 'function') fs.lchmodSync(path.join(f.source, 'absolute-link'), 0o750);
  create(f, 'modes');
  const target = path.join(f.root, 'restored');
  run(['restore', '--snapshot', path.join(f.store, 'modes'), '--target', target, '--scope', 'collection']);
  assert.equal(fs.statSync(target).mode & 0o777, 0o750);
  assert.equal(fs.statSync(path.join(target, 'alpha')).mode & 0o777, 0o751);
  assert.equal(fs.statSync(path.join(target, 'alpha', 'SKILL.md')).mode & 0o777, 0o640);
  assert.equal(fs.readlinkSync(path.join(target, 'absolute-link')), '/synthetic/missing-target');
  assert.equal(fs.lstatSync(path.join(target, 'absolute-link')).mode & 0o777, fs.lstatSync(path.join(f.source, 'absolute-link')).mode & 0o777);
});

test('explicit linked-directory preimages recover bytes independently of link-only restore', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const external = path.join(f.root, 'project-package'); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'SKILL.md'), 'original external package');
  fs.symlinkSync(external, path.join(f.source, 'linked-package'));
  assert.equal(create(f, 'link-only').captured_preimages, 0);
  assert.equal(create(f, 'with-preimage', ['--capture-link-target', 'linked-package']).captured_preimages, 1);
  fs.writeFileSync(path.join(external, 'SKILL.md'), 'changed external package');
  run(['restore', '--snapshot', path.join(f.store, 'with-preimage'), '--target', f.source, '--scope', 'collection', '--replace']);
  assert.equal(fs.readFileSync(path.join(external, 'SKILL.md'), 'utf8'), 'changed external package');
  const restored = json(run(['restore-preimage', '--snapshot', path.join(f.store, 'with-preimage'), '--link', 'linked-package', '--target', external, '--replace']));
  assert.equal(restored.original_target_path_matches, true);
  assert.equal(fs.readFileSync(path.join(external, 'SKILL.md'), 'utf8'), 'original external package');
  assert.equal(fs.readFileSync(path.join(restored.rollback, 'SKILL.md'), 'utf8'), 'changed external package');
  run(['restore-preimage', '--snapshot', path.join(f.store, 'link-only'), '--link', 'linked-package', '--target', external, '--replace'], 1);
});

test('explicit file preimages restore modes and nested target links remain uncaptured', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const external = path.join(f.root, 'AGENTS.md'); fs.writeFileSync(external, 'original contract'); fs.chmodSync(external, 0o640);
  fs.symlinkSync(external, path.join(f.source, 'contract'));
  create(f, 'file', ['--capture-link-target', 'contract']);
  fs.writeFileSync(external, 'new contract');
  run(['restore-preimage', '--snapshot', path.join(f.store, 'file'), '--link', 'contract', '--target', external, '--replace']);
  assert.equal(fs.readFileSync(external, 'utf8'), 'original contract'); assert.equal(fs.statSync(external).mode & 0o777, 0o640);
  const secret = path.join(f.root, 'credentials.json'); fs.writeFileSync(secret, 'synthetic');
  fs.symlinkSync(secret, path.join(f.source, 'secret-link'));
  run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'forbidden', '--capture-link-target', 'secret-link'], 1);
  // A regular capture stores nested link text but never silently follows it.
  fs.symlinkSync(secret, path.join(f.source, 'alpha', 'nested-link'));
  create(f, 'nested', ['--capture-link-target', 'alpha-projection']);
  const nested = manifestAt(f, 'nested').preimages[0].content.entries.find(entry => entry.path === 'nested-link');
  assert.equal(nested.type, 'symlink');
});

test('retention preserves shared objects and trashed manifests remain verifiable', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  create(f, 'a'); create(f, 'b'); const before = objectsAt(f);
  const prune = json(run(['prune', '--store', f.store, '--keep', '0', '--apply']));
  assert.deepEqual(objectsAt(f), before);
  for (const moved of prune.moved) run(['verify', '--snapshot', moved.to]);
});

test('corrupt/replaced objects are refused and cannot be silently repaired by capture', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  create(f, 'original');
  const hash = manifestAt(f, 'original').content.entries.find(entry => entry.type === 'file').sha256;
  const object = path.join(f.store, '.objects', 'sha256', hash);
  fs.rmSync(object); fs.symlinkSync(path.join(f.source, 'alpha', 'SKILL.md'), object);
  run(['verify', '--snapshot', path.join(f.store, 'original')], 2);
  run(['create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', 'no-repair'], 1);
  assert.equal(fs.existsSync(path.join(f.store, 'no-repair')), false);
  run(['restore', '--snapshot', path.join(f.store, 'original'), '--target', f.source, '--scope', 'collection', '--replace'], 1);
});

test('unsafe manifest hierarchy fails even when its tree digest is recomputed', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  create(f, 'unsafe'); const file = path.join(f.store, 'unsafe', 'manifest.json'); const manifest = manifestAt(f, 'unsafe');
  manifest.content.entries[0].path = '../escape';
  manifest.content.tree_hash = crypto.createHash('sha256').update(JSON.stringify(manifest.content.entries)).digest('hex');
  fs.writeFileSync(file, JSON.stringify(manifest));
  run(['verify', '--snapshot', path.join(f.store, 'unsafe')], 2);
  run(['restore', '--snapshot', path.join(f.store, 'unsafe'), '--target', path.join(f.root, 'destination'), '--scope', 'collection'], 1);
  assert.equal(fs.existsSync(path.join(f.root, 'escape')), false);
});

test('schema-1 content backups remain verifiable and restorable without conversion', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  create(f, 'legacy'); const snapshot = path.join(f.store, 'legacy'); const manifest = manifestAt(f, 'legacy');
  materializeTree(f.store, manifest.content, path.join(snapshot, 'content'));
  manifest.schema_version = 1; delete manifest.storage; delete manifest.preimages; delete manifest.content.root_mode;
  fs.writeFileSync(path.join(snapshot, 'manifest.json'), JSON.stringify(manifest));
  // Legacy verification depends only on the full content copy, not on shared objects.
  fs.rmSync(path.join(f.store, '.objects'), { recursive: true });
  run(['verify', '--snapshot', snapshot]);
  run(['restore', '--snapshot', snapshot, '--target', path.join(f.root, 'legacy-restored'), '--scope', 'collection']);
  assert.equal(fs.readFileSync(path.join(f.root, 'legacy-restored', 'alpha', 'SKILL.md'), 'utf8'), '# Alpha\n');
});

test('store overlap and package-parent links are refused before restore mutation', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  create(f, 'safe');
  run(['restore', '--snapshot', path.join(f.store, 'safe'), '--target', f.store, '--scope', 'collection', '--replace'], 1);
  const outside = path.join(f.root, 'outside'); fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(f.source, 'aliased'));
  run(['restore', '--snapshot', path.join(f.store, 'safe'), '--target', f.source, '--scope', 'package', '--package', 'aliased/alpha', '--replace'], 1);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('concurrent captures publish each shared object once without clobbering', async t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const tasks = Array.from({ length: 4 }, (_, index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helper, 'create', '--source', f.source, '--store', f.store, '--scope', 'collection', '--name', `parallel-${index}`]);
    let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
  }));
  await Promise.all(tasks);
  assert.equal(objectsAt(f).length, 4);
  assert.equal(objectsAt(f).every(name => /^[0-9a-f]{64}$/.test(name)), true);
  for (let index = 0; index < 4; index += 1) run(['verify', '--snapshot', path.join(f.store, `parallel-${index}`)]);
});
