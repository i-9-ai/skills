// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export const IGNORED_ROOT_NAMES = Object.freeze(['.git', '.work', 'tmp', 'node_modules']);
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

export function checkPublicHygieneBytes(relative, payload) {
  checkPublicHygiene(relative, Buffer.from(payload).toString('latin1'));
}

export function validateCatalog(value, files, directories) {
  const catalog = exactFields(value, ['schema_version', 'skills'], 'catalog');
  requireCondition(Array.isArray(catalog.skills), 'catalog must contain a skills array');
  requireCondition(catalog.schema_version === 2, 'catalog schema_version must be 2');
  requireCondition(value.skills.length > 0 && value.skills.length <= 256,
    'catalog must contain between 1 and 256 packages');
  const names = new Set();
  const packages = new Set();
  for (const entry of value.skills) {
    exactFields(entry, ['name', 'path', 'status', 'description', 'tags'], 'catalog entry');
    const name = slug(entry.name, 'catalog skill name');
    requireCondition(!names.has(name), 'catalog names must be distinct');
    names.add(name);
    const expected = `.agents/skills/${name}`;
    requireCondition(entry.path === expected, 'catalog path must be .agents/skills/<name>');
    requireCondition(['pilot', 'stable', 'deprecated'].includes(entry.status), 'invalid catalog status');
    nonblank(entry.description, 'catalog description', 220);
    requireCondition(Array.isArray(entry.tags) && entry.tags.length <= 16, 'catalog tags must be a bounded array');
    const tags = entry.tags.map((tag) => slug(tag, 'catalog tag'));
    requireCondition(new Set(tags).size === tags.length
      && [...tags].sort().every((tag, index) => tag === tags[index]),
    'catalog tags must be distinct and sorted');
    requireCondition(files.has(`${expected}/SKILL.md`), `catalog package is missing: ${name}`);
    packages.add(expected);
  }
  requireCondition([...names].sort().every((name, index) => name === value.skills[index].name),
    'catalog skills must be sorted by name');
  const actual = new Set([...directories].filter((relative) =>
    relative.startsWith('.agents/skills/') && relative.split('/').length === 3));
  requireCondition(packages.size === actual.size && [...packages].every((path) => actual.has(path)),
    'catalog and package directories do not agree');
  return { names, packages };
}

export function validateCollectionIcon(relative, text, digests) {
  requireCondition(text.startsWith('<svg ') && text.includes('<title id="title">')
    && text.includes('viewBox="0 0 64 64"'), `${relative} must be a titled 64x64 SVG`);
  validateSafeSvg(relative, text);
  requireCondition(!/<script\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=|data:|@import\b/iu.test(text),
    `${relative} contains active or external SVG content`);
  const digest = createHash('sha256').update(text).digest('hex');
  requireCondition(!digests.has(digest), `${relative} duplicates another skill icon`);
  digests.add(digest);
}

function validateSafeSvg(relative, text) {
  const stack = [];
  let offset = 0;
  let rootCount = 0;
  while (offset < text.length) {
    if (text.startsWith('<!--', offset)) {
      const end = text.indexOf('-->', offset + 4);
      requireCondition(end !== -1 && !text.slice(offset + 4, end).includes('--'), `${relative} is not well-formed XML`);
      offset = end + 3;
      continue;
    }
    if (text[offset] !== '<') {
      const end = text.indexOf('<', offset);
      const content = text.slice(offset, end === -1 ? text.length : end);
      requireCondition(stack.length > 0 || /^\s*$/.test(content), `${relative} is not well-formed XML`);
      requireCondition(!/[<&]/.test(content) || /^(?:[^<&]|&(?:amp|apos|gt|lt|quot|#[0-9]+|#x[0-9a-fA-F]+);)*$/.test(content),
        `${relative} is not well-formed XML`);
      if (stack.at(-1) === 'style') validateSvgPaintReferences(relative, content);
      offset = end === -1 ? text.length : end;
      continue;
    }
    requireCondition(!text.startsWith('<?', offset) && !text.startsWith('<!', offset), `${relative} contains unsupported XML declarations`);
    const closing = text.startsWith('</', offset);
    const tagStart = offset + (closing ? 2 : 1);
    const tagMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(text.slice(tagStart));
    requireCondition(tagMatch, `${relative} is not well-formed XML`);
    const name = tagMatch[1];
    let cursor = tagStart + name.length;
    let quote = '';
    while (cursor < text.length) {
      const character = text[cursor];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      } else {
        requireCondition(character !== '<', `${relative} is not well-formed XML`);
      }
      cursor += 1;
    }
    requireCondition(cursor < text.length && !quote, `${relative} is not well-formed XML`);
    const source = text.slice(tagStart + name.length, cursor);
    if (closing) {
      requireCondition(/^\s*$/.test(source) && stack.pop() === name, `${relative} is not well-formed XML`);
    } else {
      const selfClosing = /\/\s*$/.test(source);
      const attributes = selfClosing ? source.replace(/\/\s*$/, '') : source;
      validateXmlAttributes(relative, attributes);
      if (stack.length === 0) {
        requireCondition(name === 'svg' && rootCount === 0, `${relative} must have one SVG root element`);
        rootCount += 1;
      }
      if (!selfClosing) stack.push(name);
    }
    offset = cursor + 1;
  }
  requireCondition(stack.length === 0 && rootCount === 1, `${relative} is not well-formed XML`);
}

function validateXmlAttributes(relative, source) {
  let offset = 0;
  const names = new Set();
  while (offset < source.length) {
    const whitespace = /^\s+/.exec(source.slice(offset));
    if (whitespace) offset += whitespace[0].length;
    if (offset === source.length) break;
    const name = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(source.slice(offset));
    requireCondition(name, `${relative} is not well-formed XML`);
    requireCondition(!names.has(name[1]), `${relative} is not well-formed XML`);
    names.add(name[1]);
    offset += name[1].length;
    const equals = /^\s*=\s*/.exec(source.slice(offset));
    requireCondition(equals, `${relative} is not well-formed XML`);
    offset += equals[0].length;
    const quote = source[offset];
    requireCondition(quote === '"' || quote === "'", `${relative} is not well-formed XML`);
    const end = source.indexOf(quote, offset + 1);
    requireCondition(end !== -1, `${relative} is not well-formed XML`);
    const value = source.slice(offset + 1, end);
    requireCondition(/^(?:[^<&]|&(?:amp|apos|gt|lt|quot|#[0-9]+|#x[0-9a-fA-F]+);)*$/.test(value),
      `${relative} is not well-formed XML`);
    validateSvgPaintReferences(relative, value);
    offset = end + 1;
  }
}

function validateSvgPaintReferences(relative, value) {
  const css = stripCssComments(decodeXmlEntities(value)).replace(/\\([0-9a-fA-F]{1,6}\s?|.)/gu, (_match, escaped) => {
    const hex = escaped.trim();
    return /^[0-9a-fA-F]+$/u.test(hex) ? String.fromCodePoint(Number.parseInt(hex, 16)) : escaped;
  });
  for (const match of css.matchAll(/url\(\s*(?:(['"])(.*?)\1|([^\s)]+))\s*\)/giu)) {
    const target = (match[2] ?? match[3]).trim();
    requireCondition(target.startsWith('#'), `${relative} contains an external SVG paint reference`);
  }
}

function decodeXmlEntities(value) {
  return value.replace(/&(amp|apos|gt|lt|quot|#(?:[0-9]+|x[0-9a-fA-F]+));/gu, (_match, entity) => {
    if (entity[0] !== '#') return { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }[entity];
    const value = entity.slice(1);
    const hexadecimal = value[0].toLowerCase() === 'x';
    return String.fromCodePoint(Number.parseInt(hexadecimal ? value.slice(1) : value, hexadecimal ? 16 : 10));
  });
}

function stripCssComments(value) {
  let output = '';
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      output += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") { quote = character; output += character; continue; }
    if (character === '/' && value[index + 1] === '*') {
      const end = value.indexOf('*/', index + 2);
      if (end === -1) return output;
      index = end + 1;
      continue;
    }
    output += character;
  }
  return output;
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_CRC_TABLE = (() => {
  const values = new Uint32Array(256);
  for (let index = 0; index < values.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    values[index] = value >>> 0;
  }
  return values;
})();

function pngCrc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = PNG_CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function validateCollectionPng(relative, bytes) {
  requireCondition(Buffer.isBuffer(bytes) && bytes.length >= 57 && bytes.subarray(0, 8).equals(PNG_SIGNATURE),
    `${relative} must be a valid PNG`);
  let offset = 8;
  let ihdr;
  let sawPalette = false;
  let sawIdat = false;
  let sawIend = false;
  const idat = [];
  while (offset < bytes.length) {
    requireCondition(offset + 12 <= bytes.length, `${relative} must be a valid PNG`);
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + size;
    requireCondition(size <= LIMIT_PNG_CHUNK && end <= bytes.length && /^[A-Za-z]{4}$/.test(type),
      `${relative} must be a valid PNG`);
    const content = bytes.subarray(offset + 8, offset + 8 + size);
    requireCondition(pngCrc(bytes.subarray(offset + 4, offset + 8 + size)) === bytes.readUInt32BE(offset + 8 + size),
      `${relative} must be a valid PNG`);
    if (!ihdr) {
      requireCondition(type === 'IHDR' && size === 13, `${relative} must be a valid PNG`);
      const width = content.readUInt32BE(0);
      const height = content.readUInt32BE(4);
      const bitDepth = content[8];
      const colorType = content[9];
      requireCondition(width > 0 && height > 0 && width <= 4096 && height <= 4096
        && validPngBitDepth(bitDepth, colorType) && content[10] === 0 && content[11] === 0 && content[12] === 0,
      `${relative} must be a supported PNG`);
      ihdr = { width, height, bitDepth, colorType };
    } else if (type === 'IHDR') {
      requireCondition(false, `${relative} must be a valid PNG`);
    } else if (type === 'PLTE') {
      requireCondition(!sawPalette && !sawIdat && size >= 3 && size % 3 === 0, `${relative} must be a valid PNG`);
      sawPalette = true;
    } else if (type === 'IDAT') {
      requireCondition(!sawIend, `${relative} must be a valid PNG`);
      requireCondition(ihdr.colorType !== 3 || sawPalette, `${relative} must be a valid PNG`);
      sawIdat = true;
      idat.push(content);
    } else if (type === 'IEND') {
      requireCondition(size === 0 && sawIdat && !sawIend && end === bytes.length, `${relative} must be a valid PNG`);
      sawIend = true;
    }
    offset = end;
  }
  requireCondition(ihdr && sawIdat && sawIend, `${relative} must be a valid PNG`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
  const rowBytes = Math.ceil((ihdr.width * channels * ihdr.bitDepth) / 8);
  const expected = ihdr.height * (rowBytes + 1);
  try {
    const decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1 });
    requireCondition(decoded.length === expected
      && Array.from({ length: ihdr.height }, (_, row) => decoded[row * (rowBytes + 1)]).every((filter) => filter <= 4),
      `${relative} must be a valid PNG`);
  } catch (error) {
    if (error instanceof CollectionValidationError) throw error;
    throw new CollectionValidationError(`${relative} must be a valid PNG`);
  }
}

const LIMIT_PNG_CHUNK = 16 * 1024 * 1024;

function validPngBitDepth(bitDepth, colorType) {
  return ({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[colorType] ?? []).includes(bitDepth);
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
    const license = nonblank(source.license, 'locked source license', 256);
    requireCondition(!['unknown', 'unknown license', 'tbd', 'none', 'unlicensed', 'proprietary', 'no-license', 'n/a', 'na'].includes(license.toLowerCase()),
      'locked source license must not be a placeholder');
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
