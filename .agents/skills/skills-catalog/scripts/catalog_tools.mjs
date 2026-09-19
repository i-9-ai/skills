#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const LAYOUT = new Set(['repository', 'global']);
const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_SKILL_BYTES = 256 * 1024;
const MAX_PACKAGES = 256;
const MAX_DIRECTORIES = 8192;
const MAX_JSON_DEPTH = 64;

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

/** Bounded JSON parsing with duplicate-key detection keeps this package standalone. */
function strictJson(bytes) {
  requireCondition(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, 'JSON input must be UTF-8 bytes');
  requireCondition(bytes.byteLength <= MAX_CATALOG_BYTES, 'JSON exceeds the byte limit');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CatalogError('invalid UTF-8 JSON'); }
  let cursor = 0;
  const whitespace = () => {
    while (cursor < source.length && /[ \t\r\n]/u.test(source[cursor])) cursor += 1;
  };
  const fail = () => { throw new CatalogError('invalid bounded JSON'); };
  function string() {
    if (source[cursor] !== '"') fail();
    const start = cursor++;
    while (cursor < source.length) {
      if (source[cursor] === '\\') { cursor += 2; continue; }
      if (source[cursor++] === '"') {
        try {
          const result = JSON.parse(source.slice(start, cursor));
          requireCondition(result.isWellFormed(), 'JSON string contains invalid Unicode');
          return result;
        } catch (error) {
          if (error instanceof CatalogError) throw error;
          fail();
        }
      }
    }
    fail();
  }
  function value(depth) {
    requireCondition(depth <= MAX_JSON_DEPTH, 'JSON nesting exceeds the limit');
    whitespace();
    const character = source[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1; whitespace();
      const object = {}; const seen = new Set();
      if (source[cursor] === '}') { cursor += 1; return object; }
      while (cursor < source.length) {
        whitespace();
        const key = string();
        requireCondition(!seen.has(key), 'duplicate JSON field');
        seen.add(key); whitespace();
        if (source[cursor++] !== ':') fail();
        Object.defineProperty(object, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
        whitespace();
        const delimiter = source[cursor++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    if (character === '[') {
      cursor += 1; whitespace();
      const array = [];
      if (source[cursor] === ']') { cursor += 1; return array; }
      while (cursor < source.length) {
        array.push(value(depth + 1)); whitespace();
        const delimiter = source[cursor++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(literal, cursor)) { cursor += literal.length; return result; }
    }
    const number = source.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!number) fail();
    cursor += number[0].length;
    const result = Number(number[0]);
    requireCondition(Number.isFinite(result), 'non-finite JSON numbers are forbidden');
    return result;
  }
  const result = value(0);
  whitespace();
  if (cursor !== source.length) fail();
  return result;
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
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    requireCondition(opened.isFile() && opened.nlink === 1n && opened.dev === before.dev && opened.ino === before.ino
      && opened.size === before.size && opened.mtimeNs === before.mtimeNs, `${label} changed before reading`);
    const bytes = Buffer.alloc(limit + 1); let length = 0;
    while (length < bytes.length) {
      const read = fs.readSync(descriptor, bytes, length, bytes.length - length, length);
      if (read === 0) break;
      length += read;
    }
    requireCondition(length <= limit, `${label} exceeds ${limit} bytes`);
    const after = fs.lstatSync(filename, { bigint: true });
    requireCondition(after.dev === before.dev && after.ino === before.ino && after.size === before.size
      && after.mtimeNs === before.mtimeNs, `${label} changed while being read`);
    return bytes.subarray(0, length);
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
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
    requireCondition(/^'(?:[^']|'')*'$/u.test(value), `${label} has invalid quoting`);
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
        const scalar = top[2] ?? '';
        if (['|', '|-', '>', '>-'].includes(scalar)) {
          const fragments = [];
          while (index < end && (!lines[index].trim() || lines[index].startsWith(' '))) fragments.push(lines[index++].trim());
          description = fragments.join(' ').trim();
        } else description = parseScalar(scalar, 'skill description');
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

function directoryIdentity(filename, label) {
  const requested = path.resolve(filename);
  let linkInfo; let resolved;
  try { linkInfo = fs.lstatSync(requested, { bigint: true }); resolved = fs.realpathSync.native(requested); }
  catch { throw new CatalogError(`${label} is unreadable`); }
  requireCondition(linkInfo.isDirectory() && !linkInfo.isSymbolicLink(), `${label} must be a real directory`);
  const info = fs.lstatSync(resolved, { bigint: true });
  requireCondition(info.isDirectory() && !info.isSymbolicLink(), `${label} must resolve to a real directory`);
  return { requested, resolved, dev: info.dev, ino: info.ino };
}

function assertDirectoryIdentity(identity, label) {
  let info; let resolved;
  try { info = fs.lstatSync(identity.resolved, { bigint: true }); resolved = fs.realpathSync.native(identity.requested); }
  catch { throw new CatalogError(`${label} changed during catalog operation`); }
  requireCondition(info.isDirectory() && !info.isSymbolicLink() && info.dev === identity.dev && info.ino === identity.ino
    && resolved === identity.resolved, `${label} changed during catalog operation`);
}

function collectionConfig(input, { layout = 'repository', allowPackageLinkRoots = [] } = {}) {
  requireCondition(typeof input === 'string' && input.length > 0, 'collection root is required');
  requireCondition(LAYOUT.has(layout), 'layout must be repository or global');
  requireCondition(Array.isArray(allowPackageLinkRoots), 'allowed package link roots must be an array');
  requireCondition(layout === 'global' || allowPackageLinkRoots.length === 0,
    'package link roots are supported only by the global layout');
  const rootIdentity = directoryIdentity(input, 'collection root');
  const skillsRelative = layout === 'repository' ? path.join('.agents', 'skills') : 'skills';
  if (layout === 'repository') directoryIdentity(path.join(rootIdentity.resolved, '.agents'), '.agents');
  const skillsIdentity = directoryIdentity(path.join(rootIdentity.resolved, skillsRelative), skillsRelative);
  const linkRoots = allowPackageLinkRoots.map((entry, index) => directoryIdentity(entry, `package link root ${index + 1}`));
  requireCondition(new Set(linkRoots.map(entry => entry.resolved)).size === linkRoots.length,
    'package link roots must be distinct');
  const output = path.join(rootIdentity.resolved, 'skills-catalog.json');
  requireCondition(path.dirname(output) === rootIdentity.resolved && path.basename(output) === 'skills-catalog.json',
    'catalog output must be exactly <collection-root>/skills-catalog.json');
  return { layout, root: rootIdentity.resolved, rootIdentity, skillsIdentity, linkRoots, output };
}

function assertCollectionStable(config) {
  assertDirectoryIdentity(config.rootIdentity, 'collection root');
  assertDirectoryIdentity(config.skillsIdentity, `${config.layout} skill directory`);
  for (const [index, identity] of config.linkRoots.entries()) assertDirectoryIdentity(identity, `package link root ${index + 1}`);
  requireCondition(path.dirname(config.output) === config.root && path.basename(config.output) === 'skills-catalog.json',
    'catalog output escaped the collection root');
}

function validateCatalogPath(value, name) {
  requireCondition(typeof value === 'string' && value.length <= 1024 && !value.includes('\\'),
    'catalog path must be a bounded POSIX path');
  const parts = value.split('/');
  const repository = parts.length === 3 && parts[0] === '.agents' && parts[1] === 'skills';
  const global = parts.length >= 2 && parts[0] === 'skills';
  const skillParts = repository ? parts.slice(2) : global ? parts.slice(1) : [];
  requireCondition(skillParts.length > 0 && skillParts.length <= 24
    && skillParts.every(part => NAME.test(part)) && skillParts.at(-1) === name,
  'catalog path must be a safe repository or global skill path matching the skill name');
  return value;
}

export function validateCatalogData(value) {
  exactFields(value, ['schema_version', 'skills'], 'catalog');
  requireCondition(value.schema_version === 1, 'catalog schema_version must be 1');
  requireCondition(Array.isArray(value.skills) && value.skills.length > 0 && value.skills.length <= MAX_PACKAGES,
    `catalog must contain between 1 and ${MAX_PACKAGES} skills`);
  const fields = ['name', 'path', 'description', 'tags'];
  const names = new Set(); const paths = new Set();
  for (const entry of value.skills) {
    exactFields(entry, fields, 'catalog entry');
    validSlug(entry.name, 'catalog skill name');
    requireCondition(!names.has(entry.name), 'catalog skill names must be distinct');
    names.add(entry.name);
    validateCatalogPath(entry.path, entry.name);
    requireCondition(!paths.has(entry.path), 'catalog paths must be distinct');
    paths.add(entry.path);
    requireCondition(typeof entry.description === 'string' && entry.description.trim() === entry.description
      && entry.description.length > 0 && [...entry.description].length <= 220
      && entry.description.isWellFormed() && !/[\x00-\x1f\x7f]/u.test(entry.description),
    'catalog description must be nonblank and at most 220 characters');
    requireCondition(Array.isArray(entry.tags) && entry.tags.length <= 16, 'catalog tags must be a bounded array');
    const tags = entry.tags.map(tag => validSlug(tag, 'catalog tag', 48));
    requireCondition(new Set(tags).size === tags.length && [...tags].sort().every((tag, index) => tag === tags[index]),
      'catalog tags must be distinct and sorted');
  }
  requireCondition([...names].sort().every((name, index) => name === value.skills[index].name),
    'catalog skills must be sorted by name');
  return value;
}

function readCatalog(config, { required = true } = {}) {
  assertCollectionStable(config);
  try {
    fs.lstatSync(path.join(config.root, 'catalog.json'));
    throw new CatalogError('legacy catalog.json must be removed; skills-catalog.json is the only canonical manifest');
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    if (error.code !== 'ENOENT') throw new CatalogError('legacy catalog.json is unreadable and must be removed');
  }
  const bytes = regularBytes(config.output, 'skills-catalog.json', MAX_CATALOG_BYTES, { required });
  if (bytes === null) return { filename: config.output, bytes: null, value: null, mode: null };
  const mode = fs.lstatSync(config.output).mode & 0o777;
  let value;
  try { value = strictJson(bytes); } catch { throw new CatalogError('skills-catalog.json must be valid UTF-8 JSON'); }
  validateCatalogData(value);
  return { filename: config.output, bytes, value, mode };
}

function catalogEntry(scanPath, relativeParts, prefix) {
  requireCondition(relativeParts.length > 0 && relativeParts.length <= 24
    && relativeParts.every(part => NAME.test(part)), 'skill package path must contain only lowercase ASCII slugs');
  const expectedName = relativeParts.at(-1);
  const bytes = regularBytes(path.join(scanPath, 'SKILL.md'), `${relativeParts.join('/')}/SKILL.md`, MAX_SKILL_BYTES);
  const summary = parseSkillSummary(bytes, expectedName);
  return { name: expectedName, path: `${prefix}/${relativeParts.join('/')}`, description: summary.description, tags: summary.tags };
}

function discoverRepository(config) {
  const entries = fs.readdirSync(config.skillsIdentity.resolved, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const packages = [];
  for (const entry of entries) {
    requireCondition(!entry.isSymbolicLink(), `${entry.name} must not be a symbolic link`);
    if (entry.isFile()) {
      requireCondition(entry.name === 'AGENTS.md', 'the canonical skill directory may contain only package directories and AGENTS.md');
      continue;
    }
    requireCondition(entry.isDirectory(), `${entry.name} must be a package directory`);
    packages.push(catalogEntry(path.join(config.skillsIdentity.resolved, entry.name), [entry.name], '.agents/skills'));
    requireCondition(packages.length <= MAX_PACKAGES, `skill directory must contain at most ${MAX_PACKAGES} packages`);
  }
  return packages;
}

function directAllowedTarget(config, linkPath, linkName) {
  requireCondition(config.linkRoots.length > 0, `${linkName} is a symbolic link; pass an explicit --allow-package-link-root`);
  let resolved;
  try { resolved = fs.realpathSync.native(linkPath); }
  catch { throw new CatalogError(`${linkName} has an unreadable symbolic-link target`); }
  const allowed = config.linkRoots.find(identity => {
    const relative = path.relative(identity.resolved, resolved);
    return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..'
      && !path.isAbsolute(relative) && !relative.includes(path.sep);
  });
  requireCondition(allowed !== undefined, `${linkName} resolves outside the allowed package link roots`);
  requireCondition(path.basename(resolved) === linkName, `${linkName} link target must have the same package name`);
  const info = fs.lstatSync(resolved, { bigint: true });
  requireCondition(info.isDirectory() && !info.isSymbolicLink(), `${linkName} link target must be a real directory`);
  return { resolved, info, allowed };
}

function discoverGlobal(config) {
  const packages = []; let directories = 0;
  const walk = (directory, relativeParts) => {
    directories += 1;
    requireCondition(directories <= MAX_DIRECTORIES, `global discovery exceeds ${MAX_DIRECTORIES} directories`);
    const before = fs.lstatSync(directory, { bigint: true });
    requireCondition(before.isDirectory() && !before.isSymbolicLink(), `${relativeParts.join('/')} must be a real directory`);
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    const skill = entries.find(entry => entry.name === 'SKILL.md');
    if (skill !== undefined) {
      requireCondition(skill.isFile() && !skill.isSymbolicLink(), `${relativeParts.join('/')}/SKILL.md must be a regular file`);
      packages.push(catalogEntry(directory, relativeParts, 'skills'));
      requireCondition(packages.length <= MAX_PACKAGES, `skill directory must contain at most ${MAX_PACKAGES} packages`);
    }
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      const info = fs.lstatSync(child);
      requireCondition(!info.isSymbolicLink(), `${relativeParts.concat(entry.name).join('/')} must not be a symbolic link`);
      if (info.isDirectory()) walk(child, relativeParts.concat(entry.name));
    }
    const after = fs.lstatSync(directory, { bigint: true });
    requireCondition(after.dev === before.dev && after.ino === before.ino,
      `${relativeParts.join('/')} changed during discovery`);
  };
  const entries = fs.readdirSync(config.skillsIdentity.resolved, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === '.system' || entry.name === '.DS_Store') continue;
    const child = path.join(config.skillsIdentity.resolved, entry.name);
    const info = fs.lstatSync(child);
    if (info.isSymbolicLink()) {
      validSlug(entry.name, 'linked skill directory name');
      const target = directAllowedTarget(config, child, entry.name);
      const value = catalogEntry(target.resolved, [entry.name], 'skills');
      const after = fs.lstatSync(target.resolved, { bigint: true });
      requireCondition(after.dev === target.info.dev && after.ino === target.info.ino,
        `${entry.name} link target changed during discovery`);
      assertDirectoryIdentity(target.allowed, `allowed package root for ${entry.name}`);
      packages.push(value);
      continue;
    }
    requireCondition(info.isDirectory(), `${entry.name} must be a package directory or documented host entry`);
    walk(child, [entry.name]);
  }
  requireCondition(packages.length > 0 && packages.length <= MAX_PACKAGES,
    `skill directory must contain between 1 and ${MAX_PACKAGES} packages`);
  const names = new Set();
  for (const entry of packages) {
    requireCondition(!names.has(entry.name), `global package name ${entry.name} is ambiguous`);
    names.add(entry.name);
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

function discover(config) {
  assertCollectionStable(config);
  const packages = config.layout === 'repository' ? discoverRepository(config) : discoverGlobal(config);
  requireCondition(packages.length > 0 && packages.length <= MAX_PACKAGES,
    `skill directory must contain between 1 and ${MAX_PACKAGES} packages`);
  assertCollectionStable(config);
  return packages;
}

function checkAgentsReference(config) {
  const bytes = regularBytes(path.join(config.root, 'AGENTS.md'), 'AGENTS.md', MAX_SKILL_BYTES, { required: false });
  if (bytes === null) return;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CatalogError('AGENTS.md must be UTF-8'); }
  requireCondition(/(?:^|\n)\s*(?:(?:[-*]|\d+\.)\s+)?(?:Consult|Use)\s+`?skills-catalog\.json`?\s+(?:to\s+(?:discover|find)(?:\s+(?:the\s+)?skills?)?|for\s+(?:(?:skill\s+)?discovery|available\s+skills?))\b/iu.test(text),
    'AGENTS.md must direct agents to skills-catalog.json for skill discovery');
}

function desiredCatalog(config) {
  const skills = discover(config).map(entry => ({
    name: entry.name, path: entry.path, description: entry.description, tags: entry.tags,
  }));
  return validateCatalogData({ schema_version: 1, skills });
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

export function inspectCatalog(input, options = {}) {
  const config = collectionConfig(input, options);
  const current = readCatalog(config);
  return { schema_version: 1, layout: config.layout, catalog: config.output,
    packages: current.value.skills.length };
}

export function checkCatalog(input, options = {}) {
  const config = collectionConfig(input, options);
  checkAgentsReference(config);
  const current = readCatalog(config);
  const desired = desiredCatalog(config);
  requireCondition(current.bytes.equals(canonicalBytes(desired)),
    'skills-catalog.json is stale; run sync and inspect the diff');
  return { schema_version: 1, layout: config.layout, catalog: config.output,
    packages: desired.skills.length, changed: false, added: [], removed: [], refreshed: [] };
}

export function syncCatalog(input, options = {}) {
  const config = collectionConfig(input, options);
  checkAgentsReference(config);
  const current = readCatalog(config, { required: false });
  const desired = desiredCatalog(config);
  const next = canonicalBytes(desired);
  const changes = difference(current.value, desired);
  if (options.dryRun === true) return { schema_version: 1, layout: config.layout, catalog: config.output,
    packages: desired.skills.length, changed: !current.bytes?.equals(next), dry_run: true, written: false, ...changes };
  if (current.bytes?.equals(next)) return { schema_version: 1, layout: config.layout, catalog: config.output,
    packages: desired.skills.length, changed: false, ...changes };
  const temporary = path.join(config.root, `.skills-catalog.json.tmp-${process.pid}-${Date.now()}`);
  requireCondition(path.dirname(temporary) === config.root, 'temporary catalog escaped the collection root');
  let descriptor; let created = false;
  try {
    assertCollectionStable(config);
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
      | fs.constants.O_NOFOLLOW, 0o600);
    created = true;
    fs.writeFileSync(descriptor, next);
    fs.fchmodSync(descriptor, current.mode ?? 0o644);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    requireCondition(regularBytes(temporary, 'temporary skills catalog', MAX_CATALOG_BYTES).equals(next),
      'temporary skills catalog changed before replacement');
    const observed = regularBytes(current.filename, 'skills-catalog.json', MAX_CATALOG_BYTES, { required: false });
    requireCondition((observed === null && current.bytes === null)
      || (observed !== null && current.bytes !== null && observed.equals(current.bytes)),
    'skills-catalog.json changed before replacement');
    requireCondition((observed === null && current.mode === null)
      || (observed !== null && (fs.lstatSync(current.filename).mode & 0o777) === current.mode),
    'skills-catalog.json permissions changed before replacement');
    assertCollectionStable(config);
    fs.renameSync(temporary, current.filename);
    requireCondition(regularBytes(current.filename, 'skills-catalog.json', MAX_CATALOG_BYTES).equals(next),
      'skills-catalog.json changed during replacement');
    assertCollectionStable(config);
    const directory = fs.openSync(config.root, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (created) try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { schema_version: 1, layout: config.layout, catalog: config.output,
    packages: desired.skills.length, changed: true, ...changes };
}

function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') return {
    usage: 'catalog_tools.mjs <inspect|check|sync> <collection-root> [--layout <repository|global>] [--allow-package-link-root <path>] [--dry-run]',
    effects: 'Only sync writes skills-catalog.json; --dry-run previews without writing.',
    exits: { 0: 'success', 1: 'invalid input or stale catalog' }
  };
  requireCondition(argv.length >= 2 && ['inspect', 'check', 'sync'].includes(argv[0]),
    'usage: catalog_tools.mjs <inspect|check|sync> <collection-root> [--layout <repository|global>] [--allow-package-link-root <path>] [--dry-run]');
  const command = argv[0]; const root = argv[1];
  let layout = 'repository'; let dryRun = false; const allowPackageLinkRoots = [];
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dry-run') {
      requireCondition(command === 'sync' && !dryRun, '--dry-run applies once to sync only');
      dryRun = true; continue;
    }
    const value = argv[++index];
    requireCondition(value !== undefined, `${flag} requires a value`);
    if (flag === '--layout') layout = value;
    else if (flag === '--allow-package-link-root') allowPackageLinkRoots.push(value);
    else throw new CatalogError(`unknown option: ${flag}`);
  }
  const options = { layout, allowPackageLinkRoots, dryRun };
  if (command === 'inspect') return inspectCatalog(root, options);
  return command === 'check' ? checkCatalog(root, options) : syncCatalog(root, options);
}

const isMainModule = process.argv[1] && fs.realpathSync.native(fileURLToPath(import.meta.url))
  === fs.realpathSync.native(process.argv[1]);
if (isMainModule) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.name}: ${error.message}\n`); process.exitCode = 1; }
}
