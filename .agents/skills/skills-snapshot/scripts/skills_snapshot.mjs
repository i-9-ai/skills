#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const TOOL_VERSION = '1.0.0';

class UsageError extends Error {}

function usage() {
  return `Usage:
  skills_snapshot.mjs create --source PATH --store PATH --scope collection|package --name NAME [--package RELPATH] [--projection LABEL=PATH ...]
  skills_snapshot.mjs verify --snapshot PATH
  skills_snapshot.mjs list --store PATH [--json]
  skills_snapshot.mjs restore --snapshot PATH --target COLLECTION --scope collection|package [--package RELPATH] [--replace]
  skills_snapshot.mjs prune --store PATH --keep COUNT [--apply]

All paths and mutation scopes are caller-selected. Installation runs nothing.`;
}

function parseArgs(argv) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') return { command: 'help', options: {} };
  const options = { projection: [] };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new UsageError(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (['json', 'replace', 'apply'].includes(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`Missing value for --${key}`);
    index += 1;
    if (key === 'projection') options.projection.push(value);
    else if (Object.hasOwn(options, key)) throw new UsageError(`Repeated option: --${key}`);
    else options[key] = value;
  }
  return { command, options };
}

function requireOption(options, key) {
  if (typeof options[key] !== 'string' || options[key].length === 0) {
    throw new UsageError(`Missing required option: --${key}`);
  }
  return options[key];
}

function rejectUnknown(options, allowed) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(options)) {
    if (key === 'projection' && options.projection.length === 0) continue;
    if (!allowedSet.has(key)) throw new UsageError(`Unsupported option: --${key}`);
  }
}

function normalizeExistingDirectory(value, label) {
  const resolved = path.resolve(value);
  let stat;
  try { stat = fs.statSync(resolved); } catch { throw new UsageError(`${label} does not exist: ${value}`); }
  if (!stat.isDirectory()) throw new UsageError(`${label} is not a directory: ${value}`);
  return fs.realpathSync(resolved);
}

function normalizePath(value) {
  return path.resolve(value);
}

function prospectiveRealPath(value) {
  const resolved = path.resolve(value);
  const missing = [];
  let cursor = resolved;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  const base = fs.realpathSync(cursor);
  return path.join(base, ...missing);
}

function pathsOverlap(first, second) {
  const a = path.resolve(first);
  const b = path.resolve(second);
  const relativeAB = path.relative(a, b);
  const relativeBA = path.relative(b, a);
  const within = relative => relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  return within(relativeAB) || within(relativeBA);
}

function safeName(value, label = 'name') {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value === '.' || value === '..') {
    throw new UsageError(`Unsafe ${label}: ${value}`);
  }
  return value;
}

function safeRelative(value, label = 'package') {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || path.isAbsolute(value)) {
    throw new UsageError(`Unsafe ${label} path: ${value}`);
  }
  const portable = value.replaceAll('\\', '/').replace(/^\.\//, '');
  const normalized = path.posix.normalize(portable);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new UsageError(`Unsafe ${label} path: ${value}`);
  }
  return normalized;
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function modeOf(stat) {
  return stat.mode & 0o777;
}

function sortedNames(directory) {
  return fs.readdirSync(directory).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
}

function copyNode(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(fs.readlinkSync(source), destination);
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: modeOf(stat) });
    fs.chmodSync(destination, modeOf(stat));
    for (const name of sortedNames(source)) copyNode(path.join(source, name), path.join(destination, name));
    return;
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(destination, modeOf(stat));
    return;
  }
  throw new UsageError(`Unsupported special file: ${source}`);
}

function scanContent(root) {
  const entries = [];
  function visit(absolute, relative) {
    const stat = fs.lstatSync(absolute);
    const portable = relative.split(path.sep).join('/');
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(absolute);
      const absoluteTarget = path.isAbsolute(target);
      entries.push({
        path: portable,
        type: 'symlink',
        mode: modeOf(stat),
        target: absoluteTarget ? '<absolute-redacted>' : target,
        target_is_absolute: absoluteTarget,
        target_sha256: sha256Bytes(Buffer.from(target)),
      });
      return;
    }
    if (stat.isDirectory()) {
      if (relative) entries.push({ path: portable, type: 'directory', mode: modeOf(stat) });
      for (const name of sortedNames(absolute)) visit(path.join(absolute, name), relative ? path.join(relative, name) : name);
      return;
    }
    if (stat.isFile()) {
      entries.push({ path: portable, type: 'file', mode: modeOf(stat), size: stat.size, sha256: sha256File(absolute) });
      return;
    }
    throw new UsageError(`Unsupported special file: ${absolute}`);
  }
  visit(root, '');
  return entries.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
}

function assertNoSensitiveMaterial(root, entries) {
  const forbiddenNames = /^(?:\.env(?:\..+)?|credentials\.json|secrets\.json|id_rsa|id_ed25519)$/i;
  const forbiddenSegments = new Set(['.ssh', 'private-transcripts', 'transcripts-private']);
  const privateKeyPattern = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/;
  for (const entry of entries) {
    const segments = entry.path.split('/');
    if (segments.some(segment => forbiddenSegments.has(segment)) || forbiddenNames.test(segments.at(-1))) {
      throw new UsageError(`Sensitive material path is not allowed in a snapshot: ${entry.path}`);
    }
    if (entry.type === 'file' && entry.size <= 1024 * 1024) {
      const bytes = fs.readFileSync(path.join(root, ...segments));
      if (privateKeyPattern.test(bytes.toString('utf8'))) {
        throw new UsageError(`Private-key material is not allowed in a snapshot: ${entry.path}`);
      }
    }
  }
}

function assertNoSymlinkComponents(root, relative, label) {
  const parts = relative.split('/');
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) continue;
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new UsageError(`${label} crosses a symbolic link: ${relative}`);
  }
}

function inspectProjections(values, source) {
  const labels = new Set();
  return values.map(value => {
    const separator = value.indexOf('=');
    if (separator < 1 || separator === value.length - 1) throw new UsageError(`Projection must be LABEL=PATH: ${value}`);
    const label = safeName(value.slice(0, separator), 'projection label');
    if (labels.has(label)) throw new UsageError(`Repeated projection label: ${label}`);
    labels.add(label);
    const supplied = path.resolve(value.slice(separator + 1));
    let stat;
    try { stat = fs.lstatSync(supplied); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return {
        label,
        path_basename: path.basename(supplied),
        path_sha256: sha256Bytes(Buffer.from(supplied)),
        kind: 'missing',
        relation_to_source: 'outside',
      };
    }
    let kind = 'special';
    if (stat.isSymbolicLink()) kind = 'symlink';
    else if (stat.isDirectory()) kind = 'directory';
    else if (stat.isFile()) kind = 'file';
    const lexicalTarget = stat.isSymbolicLink() ? path.resolve(path.dirname(supplied), fs.readlinkSync(supplied)) : supplied;
    let resolved = lexicalTarget;
    try { resolved = fs.realpathSync(lexicalTarget); } catch {}
    const relative = path.relative(source, resolved);
    const relation = relative === '' ? 'source-root' : (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative) ? 'inside-source' : 'outside');
    const result = {
      label,
      path_basename: path.basename(supplied),
      path_sha256: sha256Bytes(Buffer.from(supplied)),
      kind,
      relation_to_source: relation,
    };
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(supplied);
      result.link_target = path.isAbsolute(target) ? '<absolute-redacted>' : target;
      result.link_target_is_absolute = path.isAbsolute(target);
      result.link_target_sha256 = sha256Bytes(Buffer.from(target));
    }
    return result;
  }).sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

function buildManifest(scope, packageName, entries, projections) {
  const sourceLinks = entries.filter(entry => entry.type === 'symlink');
  const selection = scope === 'package' ? { scope, package: packageName } : { scope };
  const treeHash = sha256Bytes(Buffer.from(JSON.stringify(entries)));
  return {
    schema_version: 1,
    selection,
    content: {
      algorithm: 'sha256-json-v1',
      tree_hash: treeHash,
      entries,
    },
    links: {
      source: sourceLinks,
      projections,
    },
    validation: {
      status: 'verified-at-creation',
      checks: ['content-entries', 'tree-hash', 'source-link-inventory'],
    },
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

function loadManifest(snapshot) {
  const file = path.join(snapshot, 'manifest.json');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw new UsageError(`Cannot read snapshot manifest: ${error.message}`);
  }
  if (value?.schema_version !== 1 || !['collection', 'package'].includes(value?.selection?.scope)) {
    throw new UsageError('Unsupported or malformed snapshot manifest');
  }
  if (!Array.isArray(value?.content?.entries) || typeof value?.content?.tree_hash !== 'string') {
    throw new UsageError('Malformed snapshot content identity');
  }
  return value;
}

function verifySnapshot(snapshotPath) {
  const snapshot = normalizeExistingDirectory(snapshotPath, 'Snapshot');
  const manifest = loadManifest(snapshot);
  const content = normalizeExistingDirectory(path.join(snapshot, 'content'), 'Snapshot content');
  const entries = scanContent(content);
  const treeHash = sha256Bytes(Buffer.from(JSON.stringify(entries)));
  const entriesMatch = JSON.stringify(entries) === JSON.stringify(manifest.content.entries);
  const treeHashMatches = treeHash === manifest.content.tree_hash;
  const linksMatch = JSON.stringify(entries.filter(entry => entry.type === 'symlink')) === JSON.stringify(manifest.links?.source ?? []);
  const ok = entriesMatch && treeHashMatches && linksMatch;
  return {
    ok,
    snapshot,
    scope: manifest.selection.scope,
    package: manifest.selection.package ?? null,
    tree_hash: treeHash,
    checks: { content_entries: entriesMatch, tree_hash: treeHashMatches, source_link_inventory: linksMatch },
    manifest,
  };
}

function createSnapshot(options) {
  rejectUnknown(options, ['source', 'store', 'scope', 'name', 'package', 'projection']);
  const source = normalizeExistingDirectory(requireOption(options, 'source'), 'Source');
  let store = normalizePath(requireOption(options, 'store'));
  const scope = requireOption(options, 'scope');
  if (!['collection', 'package'].includes(scope)) throw new UsageError('Scope must be collection or package');
  if (pathsOverlap(source, prospectiveRealPath(store))) throw new UsageError('Snapshot store must not overlap the source collection');
  const name = safeName(requireOption(options, 'name'), 'snapshot name');
  const packageName = scope === 'package' ? safeRelative(requireOption(options, 'package')) : null;
  if (scope === 'collection' && options.package) throw new UsageError('--package is valid only for package scope');
  if (packageName) assertNoSymlinkComponents(source, packageName, 'Selected package');
  const selectedSource = packageName ? path.join(source, ...packageName.split('/')) : source;
  const selectedStat = fs.lstatSync(selectedSource);
  if (!selectedStat.isDirectory() || selectedStat.isSymbolicLink()) throw new UsageError('Selected source must be a real directory');
  fs.mkdirSync(store, { recursive: true, mode: 0o700 });
  store = fs.realpathSync(store);
  if (pathsOverlap(source, store)) throw new UsageError('Snapshot store must not overlap the source collection');
  const destination = path.join(store, name);
  if (fs.existsSync(destination)) throw new UsageError(`Snapshot already exists: ${destination}`);
  const staging = path.join(store, `.${name}.staging-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(staging, { mode: 0o700 });
  try {
    const content = path.join(staging, 'content');
    fs.mkdirSync(content, { mode: 0o700 });
    if (packageName) copyNode(selectedSource, path.join(content, ...packageName.split('/')));
    else for (const entry of sortedNames(source)) copyNode(path.join(source, entry), path.join(content, entry));
    const entries = scanContent(content);
    assertNoSensitiveMaterial(content, entries);
    const projections = inspectProjections(options.projection, source);
    const manifest = buildManifest(scope, packageName, entries, projections);
    writeJson(path.join(staging, 'manifest.json'), manifest);
    writeJson(path.join(staging, 'receipt.json'), {
      schema_version: 1,
      snapshot_name: name,
      created_at: new Date().toISOString(),
      source,
      store,
      tool_version: TOOL_VERSION,
    });
    const verification = verifySnapshot(staging);
    if (!verification.ok) throw new Error('Staged snapshot failed self-verification');
    fs.renameSync(staging, destination);
    return { ok: true, action: 'created', snapshot: destination, scope, package: packageName, tree_hash: manifest.content.tree_hash, entries: entries.length };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function listSnapshots(options) {
  rejectUnknown(options, ['store', 'json']);
  const store = normalizeExistingDirectory(requireOption(options, 'store'), 'Store');
  const snapshots = [];
  for (const name of sortedNames(store)) {
    if (name.startsWith('.')) continue;
    const candidate = path.join(store, name);
    if (!fs.lstatSync(candidate).isDirectory()) continue;
    try {
      const manifest = loadManifest(candidate);
      let createdAt = null;
      try { createdAt = JSON.parse(fs.readFileSync(path.join(candidate, 'receipt.json'), 'utf8')).created_at ?? null; } catch {}
      snapshots.push({ name, path: candidate, scope: manifest.selection.scope, package: manifest.selection.package ?? null, tree_hash: manifest.content.tree_hash, created_at: createdAt });
    } catch {}
  }
  return { ok: true, action: 'listed', store, snapshots, json: Boolean(options.json) };
}

function uniqueRollbackPath(root, label) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
  return path.join(root, `${label}-${stamp}-${crypto.randomBytes(4).toString('hex')}`);
}

function restoreSnapshot(options) {
  rejectUnknown(options, ['snapshot', 'target', 'scope', 'package', 'replace']);
  const snapshot = normalizeExistingDirectory(requireOption(options, 'snapshot'), 'Snapshot');
  const target = normalizePath(requireOption(options, 'target'));
  const scope = requireOption(options, 'scope');
  if (!['collection', 'package'].includes(scope)) throw new UsageError('Scope must be collection or package');
  if (pathsOverlap(snapshot, prospectiveRealPath(target))) throw new UsageError('Snapshot and restore target must not overlap');
  const verification = verifySnapshot(snapshot);
  if (!verification.ok) throw new UsageError('Snapshot verification failed; restore was not started');
  const manifest = verification.manifest;
  const packageName = scope === 'package' ? safeRelative(requireOption(options, 'package')) : null;
  if (scope === 'collection' && options.package) throw new UsageError('--package is valid only for package scope');
  if (scope === 'collection' && manifest.selection.scope !== 'collection') throw new UsageError('Collection restore requires a collection snapshot');
  if (scope === 'package' && manifest.selection.scope === 'package' && manifest.selection.package !== packageName) {
    throw new UsageError(`Package snapshot contains ${manifest.selection.package}, not ${packageName}`);
  }
  if (packageName) assertNoSymlinkComponents(path.join(snapshot, 'content'), packageName, 'Snapshot package');
  const snapshotSource = packageName ? path.join(snapshot, 'content', ...packageName.split('/')) : path.join(snapshot, 'content');
  if (!fs.existsSync(snapshotSource) || !fs.lstatSync(snapshotSource).isDirectory()) throw new UsageError(`Snapshot does not contain package: ${packageName}`);
  const destination = packageName ? path.join(target, ...packageName.split('/')) : target;
  const parent = path.dirname(target);
  if (scope === 'package' && (!fs.existsSync(target) || !fs.lstatSync(target).isDirectory())) {
    throw new UsageError('Package restore target collection must already exist');
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new UsageError('Restore target must be a real collection directory');
  if (packageName) assertNoSymlinkComponents(target, path.posix.dirname(packageName) === '.' ? '' : path.posix.dirname(packageName), 'Restore package parent');
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (fs.existsSync(destination) && !options.replace) throw new UsageError('Restore destination exists; pass --replace to retain it as a rollback');
  const staging = path.join(parent, `.${path.basename(target)}.skills-snapshot-stage-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  const rollbackRoot = path.join(parent, '.skills-snapshot-rollbacks');
  const label = packageName ? `${path.basename(target)}-${packageName.replaceAll('/', '-')}` : path.basename(target);
  let rollback = null;
  try {
    copyNode(snapshotSource, staging);
    const restoredEntries = scanContent(staging);
    const restoredContentTreeHash = sha256Bytes(Buffer.from(JSON.stringify(restoredEntries)));
    if (fs.existsSync(destination)) {
      rollback = uniqueRollbackPath(rollbackRoot, label);
      fs.mkdirSync(path.dirname(rollback), { recursive: true });
      fs.renameSync(destination, rollback);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    try {
      fs.renameSync(staging, destination);
    } catch (error) {
      if (rollback && !fs.existsSync(destination)) fs.renameSync(rollback, destination);
      throw error;
    }
    return {
      ok: true,
      action: 'restored',
      snapshot,
      target: destination,
      scope,
      package: packageName,
      source_snapshot_tree_hash: manifest.content.tree_hash,
      restored_content_tree_hash: restoredContentTreeHash,
      rollback,
    };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function snapshotRetentionKey(snapshot) {
  try {
    const receipt = JSON.parse(fs.readFileSync(path.join(snapshot.path, 'receipt.json'), 'utf8'));
    if (typeof receipt.created_at === 'string' && !Number.isNaN(Date.parse(receipt.created_at))) return `${receipt.created_at}\0${snapshot.name}`;
  } catch {}
  return `0000-00-00T00:00:00.000Z\0${snapshot.name}`;
}

function pruneSnapshots(options) {
  rejectUnknown(options, ['store', 'keep', 'apply']);
  const keepText = requireOption(options, 'keep');
  if (!/^\d+$/.test(keepText)) throw new UsageError('--keep must be a non-negative integer');
  const keep = Number(keepText);
  const listed = listSnapshots({ store: requireOption(options, 'store'), projection: [] });
  const ordered = [...listed.snapshots].sort((a, b) => snapshotRetentionKey(b).localeCompare(snapshotRetentionKey(a), 'en'));
  const selected = ordered.slice(keep);
  const moved = [];
  if (options.apply && selected.length > 0) {
    const trash = path.join(listed.store, '.trash');
    fs.mkdirSync(trash, { recursive: true, mode: 0o700 });
    for (const snapshot of selected) {
      let destination = path.join(trash, snapshot.name);
      if (fs.existsSync(destination)) destination = path.join(trash, `${snapshot.name}-${crypto.randomBytes(4).toString('hex')}`);
      fs.renameSync(snapshot.path, destination);
      moved.push({ from: snapshot.path, to: destination });
    }
  }
  return { ok: true, action: options.apply ? 'pruned-to-trash' : 'prune-preview', store: listed.store, keep, selected: selected.map(item => item.name), moved };
}

function output(value) {
  if (value.action === 'listed' && !value.json) {
    for (const item of value.snapshots) process.stdout.write(`${item.name}\t${item.scope}\t${item.package ?? '-'}\t${item.tree_hash}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    let result;
    if (command === 'create') result = createSnapshot(options);
    else if (command === 'verify') {
      rejectUnknown(options, ['snapshot']);
      const check = verifySnapshot(requireOption(options, 'snapshot'));
      result = { ok: check.ok, action: 'verified', snapshot: check.snapshot, scope: check.scope, package: check.package, tree_hash: check.tree_hash, checks: check.checks };
      if (!check.ok) process.exitCode = 2;
    } else if (command === 'list') result = listSnapshots(options);
    else if (command === 'restore') result = restoreSnapshot(options);
    else if (command === 'prune') result = pruneSnapshots(options);
    else throw new UsageError(`Unknown command: ${command}`);
    output(result);
  } catch (error) {
    const prefix = error instanceof UsageError ? 'usage error' : 'error';
    process.stderr.write(`${prefix}: ${error.message}\n`);
    if (error instanceof UsageError) process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  }
}

main();
