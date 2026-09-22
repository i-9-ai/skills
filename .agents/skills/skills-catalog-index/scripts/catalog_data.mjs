// SPDX-License-Identifier: Apache-2.0
// Read-only schema-v1 decoder bundled for standalone distribution.
// Keep its accepted catalog format aligned with skills-catalog; parity is tested.
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_PACKAGES = 256;
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
export function strictJson(bytes, { maxBytes = MAX_CATALOG_BYTES } = {}) {
  requireCondition(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, 'JSON input must be UTF-8 bytes');
  requireCondition(bytes.byteLength <= maxBytes, 'JSON exceeds the byte limit');
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
