#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strictJson } from './strict-json.mjs';

const KINDS = new Set(['skills', 'guidance']);
const MAX_CONTRACT_BYTES = 1024 * 1024;
const MAX_ALIASES = 256;
const MAX_PATH = 1024;

function fail(message) { throw new Error(message); }

function relativePath(value, label) {
  if (typeof value !== 'string' || !value || value.length > MAX_PATH || path.isAbsolute(value)) {
    fail(`${label} must be a relative path of at most ${MAX_PATH} characters`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized !== value) {
    fail(`${label} must stay below the root without normalization`);
  }
  return normalized;
}

function below(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) return candidate;
  fail(`${label} escapes the root`);
}

function entry(filename) {
  try { return fs.lstatSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function existingInside(root, filename, label) {
  return below(root, fs.realpathSync.native(filename), label);
}

function parentInside(root, filename, label) {
  const requested = path.dirname(filename);
  let candidate = requested;
  while (true) {
    try {
      const existing = existingInside(root, candidate, label);
      return below(root, path.join(existing, path.relative(candidate, requested)), label);
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Only absent components can be reconstructed. A dangling parent link
      // cannot establish where its descendants would be inspected.
      if (entry(candidate)) throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

function entryInside(root, filename, label) {
  parentInside(root, filename, `${label} parent`);
  return entry(filename);
}

function resolved(root, filename, target, label) {
  const parent = parentInside(root, filename, `${label} parent`);
  const candidate = below(root, path.resolve(parent, target), label);
  return existingInside(root, candidate, label);
}

function inspectLinkTarget(root, filename, target, label) {
  const parent = parentInside(root, filename, `${label} parent`);
  below(root, path.resolve(parent, target), label);
  try { return existingInside(root, filename, label); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ELOOP') return null;
    throw error;
  }
}

function validateContract(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('contract must be an object');
  const fields = new Set(['root', 'canonical_path', 'guidance_path', 'aliases', 'observed_paths']);
  if (!Object.keys(input).every(key => fields.has(key))) fail('contract has unknown fields');
  if (typeof input.root !== 'string' || input.root.length > 4096 || !path.isAbsolute(input.root)) {
    fail('root must be an absolute path of at most 4096 characters');
  }
  if (!Array.isArray(input.aliases) || input.aliases.length > MAX_ALIASES) {
    fail(`aliases must be an array of at most ${MAX_ALIASES} entries`);
  }
  const observedPaths = input.observed_paths ?? [];
  if (!Array.isArray(observedPaths) || observedPaths.length > MAX_ALIASES) {
    fail(`observed_paths must be an array of at most ${MAX_ALIASES} entries`);
  }
  const root = fs.realpathSync.native(input.root);
  const canonicalCandidate = below(root, path.join(root, relativePath(input.canonical_path, 'canonical_path')), 'canonical_path');
  const canonical = entryInside(root, canonicalCandidate, 'canonical_path');
  if (!canonical?.isDirectory() || canonical.isSymbolicLink()) fail('canonical_path must be a real directory');
  const canonicalPath = existingInside(root, canonicalCandidate, 'canonical_path');
  const hasGuidance = input.aliases.some(alias => alias?.kind === 'guidance');
  if (hasGuidance && typeof input.guidance_path !== 'string') fail('guidance_path is required for guidance aliases');
  const guidanceCandidate = hasGuidance
    ? below(root, path.join(root, relativePath(input.guidance_path, 'guidance_path')), 'guidance_path') : null;
  if (guidanceCandidate) {
    const guidance = entryInside(root, guidanceCandidate, 'guidance_path');
    if (!guidance?.isFile() || guidance.isSymbolicLink()) fail('guidance_path must be a real file');
  }
  const guidancePath = guidanceCandidate ? existingInside(root, guidanceCandidate, 'guidance_path') : null;
  const aliases = input.aliases.map((alias, index) => {
    if (!alias || typeof alias !== 'object' || Array.isArray(alias)) fail(`alias ${index} must be an object`);
    const allowed = new Set(['kind', 'path', 'shape', 'target']);
    if (!Object.keys(alias).every(key => allowed.has(key))) fail(`alias ${index} has unknown fields`);
    if (!KINDS.has(alias.kind)) fail(`alias ${index} has an unsupported kind`);
    if (alias.shape !== 'symbolic-link') fail(`alias ${index} has an unsupported shape`);
    const aliasPath = relativePath(alias.path, `alias ${index} path`);
    const target = typeof alias.target === 'string' && alias.target && alias.target.length <= MAX_PATH
      && !path.isAbsolute(alias.target)
      ? alias.target : fail(`alias ${index} target must be a relative path of at most ${MAX_PATH} characters`);
    const filename = below(root, path.join(root, aliasPath), `alias ${index} path`);
    parentInside(root, filename, `alias ${index} path`);
    const expected = resolved(root, filename, target, `alias ${index} target`);
    const expectedPath = alias.kind === 'skills' ? canonicalPath : guidancePath;
    if (expected !== expectedPath) fail(`alias ${index} target does not resolve to its canonical path`);
    return { kind: alias.kind, path: aliasPath, target, filename };
  });
  const names = new Set(aliases.map(alias => alias.path));
  if (names.size !== aliases.length) fail('alias paths must be distinct');
  const observed = observedPaths.map((value, index) => relativePath(value, `observed_paths ${index}`));
  return { root, canonicalPath, guidancePath, aliases, observed, names };
}

function inspectAlias(root, canonicalPath, guidancePath, alias) {
  const info = entryInside(root, alias.filename, `alias ${alias.path}`);
  if (!info) return { ...alias, disposition: 'missing' };
  if (!info.isSymbolicLink()) {
    if ((alias.kind === 'skills' && info.isDirectory()) || (alias.kind === 'guidance' && info.isFile())) {
      return { ...alias, disposition: 'duplicate-copy' };
    }
    return { ...alias, disposition: 'unsupported-shape' };
  }
  const actualTarget = fs.readlinkSync(alias.filename);
  let actualPath;
  try { actualPath = inspectLinkTarget(root, alias.filename, actualTarget, `alias ${alias.path}`); }
  catch (error) {
    if (!error.message.endsWith('escapes the root')) throw error;
    return { ...alias, disposition: 'wrong-target', actual_target: actualTarget };
  }
  if (actualPath === null) return { ...alias, disposition: 'broken', actual_target: actualTarget };
  const canonicalTarget = alias.kind === 'skills' ? canonicalPath : guidancePath;
  if (actualTarget !== alias.target || actualPath !== canonicalTarget) {
    return { ...alias, disposition: 'wrong-target', actual_target: actualTarget };
  }
  return { ...alias, disposition: 'present', actual_target: actualTarget };
}

export function verifyAliases(input) {
  const { root, canonicalPath, guidancePath, aliases, observed, names } = validateContract(input);
  const results = aliases.map(alias => inspectAlias(root, canonicalPath, guidancePath, alias));
  const observedResults = observed.filter(item => !names.has(item)).flatMap((item) => {
    const filename = below(root, path.join(root, item), 'observed path');
    const info = entryInside(root, filename, 'observed path');
    if (!info) return [];
    // An undeclared leaf is evidence of an entry, not authority to follow it.
    if (!info.isSymbolicLink()) existingInside(root, filename, 'observed path');
    return [{ path: item, disposition: 'not-declared' }];
  });
  return {
    canonical: { path: input.canonical_path, disposition: 'present' },
    guidance: guidancePath ? { path: input.guidance_path, disposition: 'present' } : null,
    aliases: results.map(({ filename, ...result }) => result),
    observed: observedResults,
  };
}

function readContract(filename) {
  const before = fs.lstatSync(filename);
  if (!before.isFile() || before.nlink !== 1) fail('contract must be a regular file without symbolic or hard links');
  if (before.size > MAX_CONTRACT_BYTES) fail(`contract exceeds ${MAX_CONTRACT_BYTES} bytes`);
  const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.nlink === right.nlink && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
  let descriptor;
  try {
    // The caller owns a stable contract file. Flags add protection where the
    // platform supports them; identity checks do not make this a sandbox.
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY
      | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    if (!sameFile(before, fs.fstatSync(descriptor))) fail('contract changed before reading');
    const bytes = Buffer.alloc(MAX_CONTRACT_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(descriptor, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > MAX_CONTRACT_BYTES) fail(`contract exceeds ${MAX_CONTRACT_BYTES} bytes`);
    if (!sameFile(before, fs.fstatSync(descriptor)) || !sameFile(before, fs.lstatSync(filename))) {
      fail('contract changed during reading');
    }
    try { return strictJson(bytes.subarray(0, length)); }
    catch { fail('contract must contain unambiguous valid UTF-8 JSON'); }
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) {
  if (Number(process.versions.node.split('.')[0]) < 24) fail('Node.js 24+ is required');
  if (process.argv.length !== 3) fail('usage: verify_aliases.mjs <contract.json>');
  const contract = readContract(process.argv[2]);
  process.stdout.write(`${JSON.stringify(verifyAliases(contract), null, 2)}\n`);
}
