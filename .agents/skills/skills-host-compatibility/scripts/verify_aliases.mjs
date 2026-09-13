#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';

const KINDS = new Set(['skills', 'guidance']);

function fail(message) { throw new Error(message); }

function relativePath(value, label) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) fail(`${label} must be a relative path`);
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

function resolved(root, filename, target, label) {
  return below(root, path.resolve(path.dirname(filename), target), label);
}

function validateContract(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('contract must be an object');
  if (typeof input.root !== 'string' || !path.isAbsolute(input.root)) fail('root must be an absolute path');
  if (!Array.isArray(input.aliases)) fail('aliases must be an array');
  const root = fs.realpathSync.native(input.root);
  const canonicalPath = below(root, path.join(root, relativePath(input.canonical_path, 'canonical_path')), 'canonical_path');
  const canonical = entry(canonicalPath);
  if (!canonical?.isDirectory() || canonical.isSymbolicLink()) fail('canonical_path must be a real directory');
  const hasGuidance = input.aliases.some(alias => alias?.kind === 'guidance');
  if (hasGuidance && typeof input.guidance_path !== 'string') fail('guidance_path is required for guidance aliases');
  const guidancePath = hasGuidance
    ? below(root, path.join(root, relativePath(input.guidance_path, 'guidance_path')), 'guidance_path') : null;
  if (guidancePath) {
    const guidance = entry(guidancePath);
    if (!guidance?.isFile() || guidance.isSymbolicLink()) fail('guidance_path must be a real file');
  }
  const aliases = input.aliases.map((alias, index) => {
    if (!alias || typeof alias !== 'object' || Array.isArray(alias)) fail(`alias ${index} must be an object`);
    if (!KINDS.has(alias.kind)) fail(`alias ${index} has an unsupported kind`);
    if (alias.shape !== 'symbolic-link') fail(`alias ${index} has an unsupported shape`);
    const aliasPath = relativePath(alias.path, `alias ${index} path`);
    const target = typeof alias.target === 'string' && alias.target && !path.isAbsolute(alias.target)
      ? alias.target : fail(`alias ${index} target must be a relative path`);
    const filename = below(root, path.join(root, aliasPath), `alias ${index} path`);
    const expected = resolved(root, filename, target, `alias ${index} target`);
    const expectedPath = alias.kind === 'skills' ? canonicalPath : guidancePath;
    if (expected !== expectedPath) fail(`alias ${index} target does not resolve to its canonical path`);
    return { kind: alias.kind, path: aliasPath, target, filename };
  });
  const names = new Set(aliases.map(alias => alias.path));
  if (names.size !== aliases.length) fail('alias paths must be distinct');
  const observed = (input.observed_paths ?? []).map((value, index) => relativePath(value, `observed_paths ${index}`));
  return { root, canonicalPath, guidancePath, aliases, observed, names };
}

function inspectAlias(canonicalPath, guidancePath, alias) {
  const info = entry(alias.filename);
  if (!info) return { ...alias, disposition: 'missing' };
  if (!info.isSymbolicLink()) {
    if ((alias.kind === 'skills' && info.isDirectory()) || (alias.kind === 'guidance' && info.isFile())) {
      return { ...alias, disposition: 'duplicate-copy' };
    }
    return { ...alias, disposition: 'unsupported-shape' };
  }
  const actualTarget = fs.readlinkSync(alias.filename);
  try {
    fs.realpathSync.native(alias.filename);
  } catch (error) {
    if (error.code === 'ENOENT') return { ...alias, disposition: 'broken', actual_target: actualTarget };
    throw error;
  }
  const canonicalTarget = alias.kind === 'skills' ? canonicalPath : guidancePath;
  if (actualTarget !== alias.target || fs.realpathSync.native(alias.filename) !== canonicalTarget) {
    return { ...alias, disposition: 'wrong-target', actual_target: actualTarget };
  }
  return { ...alias, disposition: 'present', actual_target: actualTarget };
}

export function verifyAliases(input) {
  const { root, canonicalPath, guidancePath, aliases, observed, names } = validateContract(input);
  const results = aliases.map(alias => inspectAlias(canonicalPath, guidancePath, alias));
  const observedResults = observed.filter(item => !names.has(item)).flatMap((item) => {
    const filename = below(root, path.join(root, item), 'observed path');
    return entry(filename) ? [{ path: item, disposition: 'not-declared' }] : [];
  });
  return {
    canonical: { path: input.canonical_path, disposition: 'present' },
    guidance: guidancePath ? { path: input.guidance_path, disposition: 'present' } : null,
    aliases: results.map(({ filename, ...result }) => result),
    observed: observedResults,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length !== 3) fail('usage: verify_aliases.mjs <contract.json>');
  const contract = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(`${JSON.stringify(verifyAliases(contract), null, 2)}\n`);
}
