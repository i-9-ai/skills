#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const STATUS = new Set(['pilot', 'stable', 'deprecated']);
const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_SKILL_BYTES = 256 * 1024;
const MAX_PACKAGES = 256;

export class CatalogError extends Error {
  constructor(message) { super(message); this.name = 'CatalogError'; }
}

function requireCondition(condition, message) {
  if (!condition) throw new CatalogError(message);
}

function exactFields(value, fields, label) {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const keys = Object.keys(value);
  requireCondition(keys.length === fields.length && fields.every(key => Object.hasOwn(value, key)),
    `${label} has missing or unexpected fields`);
  return value;
}

function validSlug(value, label, limit = 64) {
  requireCondition(typeof value === 'string' && value.length <= limit && value.trim() === value && NAME.test(value),
    `${label} must be a lowercase ASCII slug of at most ${limit} characters`);
  return value;
}

function regularBytes(filename, label, limit, { required = true } = {}) {
  let before;
  try { before = fs.lstatSync(filename, { bigint: true }); } catch (error) {
    if (!required && error.code === 'ENOENT') return null;
    throw new CatalogError(`${label} is missing or unreadable`);
  }
  requireCondition(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n,
    `${label} must be one regular, non-linked file`);
  requireCondition(before.size <= BigInt(limit), `${label} exceeds ${limit} bytes`);
  const bytes = fs.readFileSync(filename);
  const after = fs.lstatSync(filename, { bigint: true });
  requireCondition(after.dev === before.dev && after.ino === before.ino && after.size === before.size
    && after.mtimeNs === before.mtimeNs, `${label} changed while being read`);
  return bytes;
}

function parseScalar(source, label) {
  let value = source.trim();
  requireCondition(value.length > 0, `${label} is empty`);
  if (value.startsWith('"')) {
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new CatalogError(`${label} has invalid quoting`); }
    requireCondition(typeof parsed === 'string', `${label} must be a string`);
    return parsed;
  }
  if (value.startsWith("'")) {
    requireCondition(value.endsWith("'") && value.length >= 2, `${label} has invalid quoting`);
    return value.slice(1, -1).replaceAll("''", "'");
  }
  let comment = -1;
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === '#' && /\s/u.test(value[index - 1])) { comment = index; break; }
  }
  value = (comment === -1 ? value : value.slice(0, comment)).trimEnd();
  requireCondition(value.length > 0 && !/^[\[\{&*!|>#]/u.test(value),
    `${label} must use a plain or quoted scalar`);
  requireCondition(!/:(?:\s|$)/u.test(value), `${label} contains an unquoted mapping separator`);
  requireCondition(!/[\x00-\x1f\x7f]/u.test(value), `${label} contains a control character`);
  return value;
}

export function parseSkillSummary(bytes, expectedName) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CatalogError(`${expectedName}/SKILL.md must be UTF-8`); }
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  requireCondition(lines[0] === '---', `${expectedName}/SKILL.md must start with frontmatter`);
  const end = lines.indexOf('---', 1);
  requireCondition(end > 1, `${expectedName}/SKILL.md has unterminated frontmatter`);
  let name; let description; let tags = []; let section = '';
  const seen = new Set();
  let index = 1;
  while (index < end) {
    const line = lines[index++];
    const top = /^([a-z][a-z0-9_-]*):(?:\s*(.*))?$/u.exec(line);
    if (top) {
      section = top[1];
      requireCondition(!seen.has(section), `${expectedName}/SKILL.md has duplicate frontmatter fields`);
      seen.add(section);
      if (section === 'name') name = parseScalar(top[2] ?? '', 'skill name');
      if (section === 'description') {
        const value = top[2] ?? '';
        if (['|', '|-', '>', '>-'].includes(value)) {
          const fragments = [];
          while (index < end && (!lines[index].trim() || lines[index].startsWith(' '))) {
            fragments.push(lines[index++].trim());
          }
          // Catalog descriptions are one-line summaries. Literal blocks preserve newlines
          // for a YAML consumer, but the generated catalog must remain control-character-free.
          description = fragments.join(' ').trim();
        } else description = parseScalar(value, 'skill description');
      }
      continue;
    }
    const metadata = /^  ([a-z][a-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (section === 'metadata' && metadata?.[1] === 'tags') {
      requireCondition(!seen.has('metadata.tags'), `${expectedName}/SKILL.md has duplicate metadata tags`);
      seen.add('metadata.tags');
      const raw = parseScalar(metadata[2], 'skill tags');
      tags = [...new Set(raw.split(',').map(tag => validSlug(tag.trim(), 'skill tag', 48)))].sort();
    }
  }
  validSlug(name, 'skill name');
  requireCondition(name === expectedName, `${expectedName}/SKILL.md name must match its directory`);
  requireCondition(typeof description === 'string' && description.trim() === description
    && description.length > 0 && [...description].length <= 220 && description.isWellFormed()
    && !/[\x00-\x1f\x7f]/u.test(description),
  `${expectedName}/SKILL.md description must be nonblank and at most 220 characters`);
  requireCondition(tags.length <= 16, `${expectedName}/SKILL.md has more than 16 catalog tags`);
  return { name, description, tags };
}

function collectionRoot(input) {
  requireCondition(typeof input === 'string' && input.length > 0, 'repository root is required');
  let root;
  try { root = fs.realpathSync.native(input); } catch { throw new CatalogError('repository root is unreadable'); }
  requireCondition(fs.lstatSync(root).isDirectory(), 'repository root must be a directory');
  for (const relative of ['.agents', '.agents/skills']) {
    const info = fs.lstatSync(path.join(root, relative));
    requireCondition(info.isDirectory() && !info.isSymbolicLink(), `${relative} must be a real directory`);
  }
  return root;
}

export function validateCatalogData(value, { allowVersion1 = false } = {}) {
  exactFields(value, ['schema_version', 'skills'], 'catalog');
  requireCondition(value.schema_version === 2 || (allowVersion1 && value.schema_version === 1),
    `catalog schema_version must be ${allowVersion1 ? '1 or 2' : '2'}`);
  requireCondition(Array.isArray(value.skills) && value.skills.length > 0 && value.skills.length <= MAX_PACKAGES,
    `catalog must contain between 1 and ${MAX_PACKAGES} skills`);
  const fields = value.schema_version === 1 ? ['name', 'path', 'status']
    : ['name', 'path', 'status', 'description', 'tags'];
  const names = new Set();
  for (const entry of value.skills) {
    exactFields(entry, fields, 'catalog entry');
    validSlug(entry.name, 'catalog skill name');
    requireCondition(!names.has(entry.name), 'catalog skill names must be distinct');
    names.add(entry.name);
    requireCondition(entry.path === `.agents/skills/${entry.name}`, 'catalog path must match the skill name');
    requireCondition(STATUS.has(entry.status), 'catalog status must be pilot, stable, or deprecated');
    if (value.schema_version === 2) {
      requireCondition(typeof entry.description === 'string' && entry.description.trim() === entry.description
        && entry.description.length > 0 && [...entry.description].length <= 220
        && entry.description.isWellFormed() && !/[\x00-\x1f\x7f]/u.test(entry.description),
      'catalog description must be nonblank and at most 220 characters');
      requireCondition(Array.isArray(entry.tags) && entry.tags.length <= 16, 'catalog tags must be a bounded array');
      const tags = entry.tags.map(tag => validSlug(tag, 'catalog tag', 48));
      requireCondition(new Set(tags).size === tags.length && [...tags].sort().every((tag, index) => tag === tags[index]),
        'catalog tags must be distinct and sorted');
    }
  }
  if (value.schema_version === 2) {
    requireCondition([...names].sort().every((name, index) => name === value.skills[index].name),
      'catalog skills must be sorted by name');
  }
  return value;
}

function readCatalog(root, { required = true, allowVersion1 = false } = {}) {
  const filename = path.join(root, 'catalog.json');
  const bytes = regularBytes(filename, 'catalog.json', MAX_CATALOG_BYTES, { required });
  if (bytes === null) return { filename, bytes: null, value: null, mode: null };
  const mode = fs.lstatSync(filename).mode & 0o777;
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new CatalogError('catalog.json must be valid UTF-8 JSON'); }
  validateCatalogData(value, { allowVersion1 });
  return { filename, bytes, value, mode };
}

function discover(root) {
  const directory = path.join(root, '.agents', 'skills');
  const entries = [];
  const handle = fs.opendirSync(directory);
  try {
    for (;;) {
      const entry = handle.readSync();
      if (entry === null) break;
      entries.push(entry);
      requireCondition(entries.length <= MAX_PACKAGES,
        `skill directory must contain at most ${MAX_PACKAGES} packages`);
    }
  } finally { handle.closeSync(); }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const packages = entries.filter(entry => {
    requireCondition(!entry.isSymbolicLink(), `${entry.name} must not be a symbolic link`);
    if (entry.isDirectory()) return true;
    requireCondition(entry.isFile() && entry.name === 'AGENTS.md',
      'the canonical skill directory may contain only package directories and AGENTS.md');
    return false;
  });
  requireCondition(packages.length > 0 && packages.length <= MAX_PACKAGES,
    `skill directory must contain between 1 and ${MAX_PACKAGES} packages`);
  return packages.map(entry => {
    validSlug(entry.name, 'skill directory name');
    requireCondition(entry.isDirectory() && !entry.isSymbolicLink(), `${entry.name} must be a real package directory`);
    const bytes = regularBytes(path.join(directory, entry.name, 'SKILL.md'), `${entry.name}/SKILL.md`, MAX_SKILL_BYTES);
    const summary = parseSkillSummary(bytes, entry.name);
    return { name: entry.name, path: `.agents/skills/${entry.name}`, description: summary.description, tags: summary.tags };
  });
}

function checkAgentsReference(root) {
  const bytes = regularBytes(path.join(root, 'AGENTS.md'), 'AGENTS.md', MAX_SKILL_BYTES, { required: false });
  if (bytes === null) return;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CatalogError('AGENTS.md must be UTF-8'); }
  requireCondition(/(?:^|\n)\s*(?:Consult|Use)\s+`?catalog\.json`?\s+(?:to\s+(?:discover|find)(?:\s+(?:the\s+)?skills?)?|for\s+(?:(?:skill\s+)?discovery|available\s+skills?))\b/iu.test(text),
    'AGENTS.md must direct agents to catalog.json for skill discovery');
}

function desiredCatalog(root, current) {
  const statuses = new Map((current?.skills ?? []).map(entry => [entry.name, entry.status]));
  const skills = discover(root).map(entry => ({
    name: entry.name, path: entry.path, status: statuses.get(entry.name) ?? 'pilot',
    description: entry.description, tags: entry.tags,
  }));
  return validateCatalogData({ schema_version: 2, skills });
}

function difference(current, desired) {
  const before = new Map((current?.skills ?? []).map(entry => [entry.name, entry]));
  const after = new Map(desired.skills.map(entry => [entry.name, entry]));
  return {
    added: [...after.keys()].filter(name => !before.has(name)),
    removed: [...before.keys()].filter(name => !after.has(name)),
    refreshed: [...after.keys()].filter(name => before.has(name)
      && JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name))),
  };
}

function canonicalBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }

export function checkCatalog(input) {
  const root = collectionRoot(input);
  checkAgentsReference(root);
  const current = readCatalog(root);
  const desired = desiredCatalog(root, current.value);
  const expected = canonicalBytes(desired);
  requireCondition(current.bytes.equals(expected), 'catalog.json is stale; run sync and inspect the diff');
  return { schema_version: 2, packages: desired.skills.length, changed: false,
    added: [], removed: [], refreshed: [] };
}

export function syncCatalog(input) {
  const root = collectionRoot(input);
  checkAgentsReference(root);
  const current = readCatalog(root, { required: false, allowVersion1: true });
  const desired = desiredCatalog(root, current.value);
  const next = canonicalBytes(desired);
  const changes = difference(current.value, desired);
  if (current.bytes?.equals(next)) return { schema_version: 2, packages: desired.skills.length,
    changed: false, ...changes };
  const temporary = path.join(root, `.catalog.json.tmp-${process.pid}-${Date.now()}`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
      | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(descriptor, next); fs.fchmodSync(descriptor, current.mode ?? 0o644); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    const observed = regularBytes(current.filename, 'catalog.json', MAX_CATALOG_BYTES, { required: false });
    requireCondition((observed === null && current.bytes === null)
      || (observed !== null && current.bytes !== null && observed.equals(current.bytes)),
    'catalog.json changed before replacement');
    requireCondition((observed === null && current.mode === null)
      || (observed !== null && (fs.lstatSync(current.filename).mode & 0o777) === current.mode),
    'catalog.json permissions changed before replacement');
    fs.renameSync(temporary, current.filename);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { schema_version: 2, packages: desired.skills.length, changed: true, ...changes };
}

function main(argv) {
  requireCondition(argv.length === 2 && ['check', 'sync'].includes(argv[0]),
    'usage: catalog_tools.mjs <check|sync> <repository-root>');
  return argv[0] === 'check' ? checkCatalog(argv[1]) : syncCatalog(argv[1]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.name}: ${error.message}\n`); process.exitCode = 1; }
}
