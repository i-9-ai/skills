// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

export const IGNORED_ROOT_NAMES = Object.freeze(['.git', '.work', 'tmp']);
export const REPOSITORY_ALIASES = Object.freeze({
  'CLAUDE.md': 'AGENTS.md',
  '.claude/skills': '../.agents/skills',
  '.github/skills': '../.agents/skills',
});

const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PUBLIC_PATTERNS = [
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['cloud access credential', /\bAKIA[A-Z0-9]{16}\b/],
  ['GitHub credential', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b|\bgithub_pat_[A-Za-z0-9_]{22,255}\b/],
  ['API credential', /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/],
  ['authenticated URL', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
  ['private local path', /\/(?:Users|home)\/[A-Za-z0-9_.-]+(?:\/|\b)|[A-Za-z]:\\(?:Users)\\/],
];

export class CollectionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CollectionValidationError';
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new CollectionValidationError(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, expected, label) {
  requireCondition(isObject(value), `${label} must be an object`);
  const keys = Object.keys(value);
  requireCondition(keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key)),
    `${label} has missing or unexpected fields`);
  return value;
}

function nonblank(value, label, limit) {
  requireCondition(typeof value === 'string' && value.trim().length > 0 && [...value].length <= limit,
    `${label} must be a nonblank string of at most ${limit} characters`);
  requireCondition(value.isWellFormed() && !/[\x00-\x08\x0b-\x1f\x7f]/.test(value),
    `${label} contains invalid Unicode or control characters`);
  return value;
}

function slug(value, label) {
  requireCondition(typeof value === 'string' && value.length <= 64 && value.trim() === value
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value),
    `${label} must be a lowercase hyphenated slug of at most 64 characters`);
  return value;
}

function relativePath(value) {
  requireCondition(typeof value === 'string' && value.length > 0 && value.length <= 1024,
    'path must be a nonempty relative POSIX path of at most 1024 characters');
  requireCondition(value.isWellFormed() && !/[\\\x00-\x1f\x7f]/.test(value),
    'path contains a backslash, invalid Unicode, or control character');
  requireCondition(!value.startsWith('/') && !/^[A-Za-z]:/.test(value), 'absolute paths are not allowed');
  const parts = value.split('/');
  requireCondition(parts.every((part) => !['', '.', '..'].includes(part)),
    'path contains an empty, current-directory, or parent-directory component');
  requireCondition(parts.length <= 24, 'path nesting exceeds the limit');
}

export function checkPublicHygiene(relative, text) {
  for (const [label, pattern] of PUBLIC_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const line = text.slice(0, match.index).split('\n').length;
      // Report a location and category, never credential-like matched bytes.
      throw new CollectionValidationError(`${relative}:${line}: possible ${label}; inspect and sanitize`);
    }
  }
}

export function validateCatalog(value, files, directories) {
  requireCondition(isObject(value) && Array.isArray(value.skills), 'catalog must contain a skills array');
  requireCondition(value.schema_version === 1, 'catalog schema_version must be 1');
  requireCondition(value.skills.length > 0 && value.skills.length <= 256,
    'catalog must contain between 1 and 256 packages');
  const names = new Set();
  const packages = new Set();
  for (const entry of value.skills) {
    requireCondition(isObject(entry), 'catalog entry must be an object');
    const name = slug(entry.name, 'catalog skill name');
    requireCondition(!names.has(name), 'catalog names must be distinct');
    names.add(name);
    const expected = `.agents/skills/${name}`;
    requireCondition(entry.path === expected, 'catalog path must be .agents/skills/<name>');
    requireCondition(['pilot', 'stable', 'deprecated'].includes(entry.status), 'invalid catalog status');
    requireCondition(files.has(`${expected}/SKILL.md`), `catalog package is missing: ${name}`);
    packages.add(expected);
  }
  const actual = new Set([...directories].filter((relative) =>
    relative.startsWith('.agents/skills/') && relative.split('/').length === 3));
  requireCondition(packages.size === actual.size && [...packages].every((path) => actual.has(path)),
    'catalog and package directories do not agree');
  return { names, packages };
}

export function validateLock(value, names) {
  const data = exactFields(value, ['schema_version', 'observed_on', 'hash_algorithm', 'sources'], 'upstream lock');
  requireCondition(data.schema_version === 1, 'upstream lock schema_version must be 1');
  requireCondition(data.hash_algorithm === 'sha256', 'upstream lock hash_algorithm must be sha256');
  const observed = typeof data.observed_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.observed_on)
    ? new Date(`${data.observed_on}T00:00:00Z`) : new Date(NaN);
  requireCondition(!Number.isNaN(observed.valueOf()) && observed.toISOString().slice(0, 10) === data.observed_on,
    'upstream lock observed_on must be an ISO date');
  requireCondition(Array.isArray(data.sources) && data.sources.length > 0 && data.sources.length <= 128,
    'upstream lock sources must contain between 1 and 128 entries');
  const identifiers = new Set();
  for (const item of data.sources) {
    const source = exactFields(item, ['id', 'repository', 'revision', 'package_path', 'license', 'license_path',
      'license_sha256', 'reuse', 'consumers', 'files', 'package_sha256'], 'locked source');
    const identifier = slug(source.id, 'locked source id');
    requireCondition(!identifiers.has(identifier), 'locked source IDs must be distinct');
    identifiers.add(identifier);
    nonblank(source.repository, 'locked repository', 2048);
    let repository;
    try { repository = new URL(source.repository); } catch { /* Rejected by the condition below. */ }
    requireCondition(repository?.protocol === 'https:' && repository.hostname && !repository.username
      && !repository.password && !repository.search && !repository.hash,
    'locked repository must be a public HTTPS URL');
    requireCondition(typeof source.revision === 'string' && [40, 64].includes(source.revision.length)
      && REVISION.test(source.revision),
      'locked source revision must be an immutable 40/64-hex commit');
    relativePath(source.package_path);
    relativePath(source.license_path);
    nonblank(source.license, 'locked source license', 256);
    requireCondition(['pattern', 'adapt', 'reference', 'reject'].includes(source.reuse), 'invalid locked source reuse');
    for (const key of ['license_sha256', 'package_sha256']) {
      requireCondition(typeof source[key] === 'string' && source[key].length === 64 && SHA256.test(source[key]),
        `locked source ${key} must be a lowercase SHA-256`);
    }
    requireCondition(Array.isArray(source.consumers) && source.consumers.length <= names.size,
      'invalid locked source consumers');
    requireCondition(source.consumers.every((name) => typeof name === 'string' && names.has(name)),
      'locked source consumer must name a catalog package');
    requireCondition(new Set(source.consumers).size === source.consumers.length,
      'locked source consumers must be distinct');
    requireCondition(Array.isArray(source.files) && source.files.length > 0 && source.files.length <= 2048,
      'locked source files must contain between 1 and 2048 entries');
    const hashes = new Map();
    for (const item of source.files) {
      const file = exactFields(item, ['path', 'sha256'], 'locked file');
      relativePath(file.path);
      requireCondition(!hashes.has(file.path), 'locked file paths must be distinct');
      requireCondition(typeof file.sha256 === 'string' && file.sha256.length === 64 && SHA256.test(file.sha256),
        'locked file sha256 must be a lowercase SHA-256');
      hashes.set(file.path, file.sha256);
    }
    const aggregate = createHash('sha256');
    const sorted = [...hashes].sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    for (const [path, digest] of sorted) aggregate.update(`${path}\0${digest}\n`, 'utf8');
    requireCondition(aggregate.digest('hex') === source.package_sha256,
      `locked source package aggregate mismatch: ${identifier}`);
  }
  return data.sources.length;
}
