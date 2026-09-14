/** Pure structural contracts. No filesystem, process execution, or network access. */
import path from 'node:path';

export const LIMITS = Object.freeze({
  textBytes: 262_144, jsonBytes: 1_048_576, artifactBytes: 4_194_304,
  totalBytes: 33_554_432, entries: 2048, depth: 24, jsonDepth: 64,
});
export const STAGES = Object.freeze(['intake', 'discovery', 'synthesis', 'design', 'authoring', 'evaluation']);
export const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![\s\S])/u;
export const SHA256 = /^[0-9a-f]{64}(?![\s\S])/u;
export const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/u;

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
export function requireCondition(condition, message) {
  if (!condition) throw new ValidationError(message);
}
export function validSlug(value, label = 'name') {
  requireCondition(typeof value === 'string' && value.length <= 64 && SLUG.test(value),
    `${label} must be a lowercase hyphenated slug of at most 64 characters`);
  return value;
}
export function nonblank(value, label, limit = 4096) {
  requireCondition(typeof value === 'string' && value.trim().length > 0 && [...value].length <= limit,
    `${label} must be a nonblank string of at most ${limit} characters`);
  requireCondition(value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    `${label} contains invalid Unicode or control characters`);
  return value;
}
export function relativeParts(value) {
  requireCondition(typeof value === 'string' && value.length > 0 && value.length <= 1024,
    'path must be a nonempty relative POSIX path of at most 1024 characters');
  requireCondition(value.isWellFormed() && !/[\\\u0000-\u001f\u007f]/u.test(value),
    'path contains a backslash, invalid Unicode, or control character');
  requireCondition(!value.startsWith('/') && !/^[A-Za-z]:/u.test(value), 'absolute paths are not allowed');
  const parts = value.split('/');
  requireCondition(parts.every(part => !['', '.', '..'].includes(part)),
    'path contains an empty, current-directory, or parent-directory component');
  requireCondition(parts.length <= LIMITS.depth, 'path nesting exceeds the limit');
  return parts;
}
export function fields(value, requiredKeys, label) {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const required = [...requiredKeys].sort();
  const actual = Object.keys(value).sort();
  requireCondition(actual.length === required.length && actual.every((key, index) => key === required[index]),
    `${label} fields must be exactly: ${required.join(', ')}`);
  return value;
}

/** A bounded JSON parser retains duplicate-key detection that JSON.parse lacks. */
export function strictJson(bytes) {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  requireCondition(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array, 'JSON input must be UTF-8 bytes');
  requireCondition(buffer.byteLength <= LIMITS.jsonBytes, 'JSON exceeds the byte limit');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new ValidationError('invalid UTF-8 JSON'); }
  let cursor = 0;
  const whitespace = () => { while (/[ \t\r\n]/u.test(text[cursor] ?? '') && cursor < text.length) cursor += 1; };
  const fail = () => { throw new ValidationError('invalid bounded JSON'); };
  function string() {
    if (text[cursor] !== '"') fail();
    const start = cursor++;
    while (cursor < text.length) {
      if (text[cursor] === '\\') { cursor += 2; continue; }
      if (text[cursor++] === '"') {
        try {
          const result = JSON.parse(text.slice(start, cursor));
          requireCondition(result.isWellFormed(), 'JSON string contains invalid Unicode');
          return result;
        } catch { fail(); }
      }
    }
    fail();
  }
  function value(depth) {
    requireCondition(depth <= LIMITS.jsonDepth, 'JSON nesting exceeds the limit');
    whitespace();
    const character = text[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1; whitespace();
      const object = {};
      const seen = new Set();
      if (text[cursor] === '}') { cursor += 1; return object; }
      while (cursor < text.length) {
        whitespace();
        const key = string();
        requireCondition(!seen.has(key), 'duplicate JSON field');
        seen.add(key); whitespace();
        if (text[cursor++] !== ':') fail();
        Object.defineProperty(object, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
        whitespace();
        const delimiter = text[cursor++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    if (character === '[') {
      cursor += 1; whitespace();
      const array = [];
      if (text[cursor] === ']') { cursor += 1; return array; }
      while (cursor < text.length) {
        array.push(value(depth + 1)); whitespace();
        const delimiter = text[cursor++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, cursor)) { cursor += literal.length; return result; }
    }
    const number = text.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!number) fail();
    cursor += number[0].length;
    const result = Number(number[0]);
    requireCondition(Number.isFinite(result), 'non-finite JSON numbers are forbidden');
    return result;
  }
  const result = value(0);
  whitespace();
  if (cursor !== text.length) fail();
  return result;
}

export function scalar(input, label) {
  let value = input;
  if (value.startsWith('"')) {
    try { value = JSON.parse(value); } catch { throw new ValidationError(`unsupported quoted scalar in ${label}`); }
    requireCondition(typeof value === 'string' && value.isWellFormed(), `${label} must be a string`);
  } else if (value.startsWith("'")) {
    requireCondition(/^'(?:[^']|'')*'$/u.test(value), `invalid quoted scalar in ${label}`);
    value = value.slice(1, -1).replaceAll("''", "'");
  } else {
    let comment = -1;
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] === '#' && /\s/u.test(value[index - 1])) {
        comment = index;
        break;
      }
    }
    value = (comment === -1 ? value : value.slice(0, comment)).trimEnd();
    requireCondition(value.length > 0 && !/^[\[\{&*!|>#]/u.test(value), `${label} must use a plain or quoted scalar`);
    requireCondition(!/:(?:\s|$)/u.test(value), `${label} contains an unquoted YAML mapping separator`);
    requireCondition(!['true', 'false', 'yes', 'no', 'on', 'off', 'null', '~', '.inf', '.nan'].includes(value.toLowerCase())
      && !/^[-+]?\d+(?:\.\d+)?$/u.test(value), `${label} must be a string, not a YAML boolean, null, or number`);
  }
  return value;
}
export function validateMetadata(metadata) {
  requireCondition(metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata), 'metadata must be a flat string mapping');
  requireCondition(Object.values(metadata).every(item => typeof item === 'string'), 'metadata values must be strings');
  if (Object.hasOwn(metadata, 'reasoning-effort')) {
    requireCondition(['low', 'medium', 'high'].includes(metadata['reasoning-effort']), 'unsupported advisory reasoning effort');
  }
}
export function parseFrontmatter(text) {
  const lines = text.split(/\r\n|\n|\r/u);
  requireCondition(lines[0] === '---', 'SKILL.md must begin with YAML frontmatter');
  const end = lines.indexOf('---', 1);
  requireCondition(end !== -1, 'SKILL.md frontmatter is not closed');
  const values = {};
  const seen = new Set();
  let index = 1;
  while (index < end) {
    const line = lines[index++];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u);
    requireCondition(match !== null, 'invalid or unsupported frontmatter field indentation');
    const key = match[1]; let value = match[2];
    requireCondition(!seen.has(key), 'duplicate frontmatter field'); seen.add(key);
    if (key === 'metadata') {
      requireCondition(value === '', 'metadata must use an indented flat string mapping');
      const metadata = {};
      while (index < end && (!lines[index].trim() || /^[ \t]/u.test(lines[index]))) {
        const nested = lines[index++];
        if (!nested.trim() || nested.trimStart().startsWith('#')) continue;
        const item = nested.match(/^  ([A-Za-z][A-Za-z0-9_/-]*):[ \t]*(.*)$/u);
        requireCondition(item !== null, 'metadata must contain two-space-indented string fields');
        requireCondition(!Object.hasOwn(metadata, item[1]), 'duplicate metadata field');
        Object.defineProperty(metadata, item[1], { value: scalar(item[2], item[1]), enumerable: true });
      }
      requireCondition(Object.keys(metadata).length > 0, 'metadata mapping must not be empty');
      validateMetadata(metadata); values.metadata = metadata; continue;
    }
    if (!['name', 'description', 'license', 'compatibility', 'allowed-tools'].includes(key)) continue;
    if (['|', '|-', '>', '>-'].includes(value)) {
      const fragments = [];
      while (index < end && (!lines[index].trim() || lines[index].startsWith(' '))) fragments.push(lines[index++].trim());
      value = fragments.join(value.startsWith('>') ? ' ' : '\n').trim();
    } else value = scalar(value, key);
    values[key] = value;
    if (key === 'compatibility') nonblank(value, key, 500);
    if (key === 'allowed-tools') nonblank(value, key);
  }
  requireCondition(Object.hasOwn(values, 'name') && Object.hasOwn(values, 'description'), 'frontmatter requires name and description');
  return values;
}

function stripInlineCode(line) {
  let output = '';
  let cursor = 0;
  while (cursor < line.length) {
    if (line[cursor] !== '`') {
      output += line[cursor];
      cursor += 1;
      continue;
    }
    let width = 1;
    while (line[cursor + width] === '`') width += 1;
    const marker = '`'.repeat(width);
    const end = line.indexOf(marker, cursor + width);
    if (end === -1) {
      output += line.slice(cursor);
      break;
    }
    output += ' '.repeat(end + width - cursor);
    cursor = end + width;
  }
  return output;
}

/** Ordinary Markdown only: HTML, escaped syntax, generated links, and anchors need review. */
export function markdownLinks(text) {
  let fence = null;
  const visible = text.split(/\r\n|\n|\r/u).map(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (marker) {
      const run = marker[1];
      if (fence === null) fence = run;
      else if (run[0] === fence[0] && run.length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : stripInlineCode(line);
  });
  const links = [];
  for (const [index, line] of visible.entries()) {
    for (const target of inlineMarkdownLinks(line)) links.push([index + 1, target]);
    for (const match of line.matchAll(/^\s{0,3}\[[^\[\]]+\]:\s*(?:<([^>]+)>|(\S+))/gu)) links.push([index + 1, match[1] ?? match[2]]);
  }
  return links;
}

function inlineMarkdownLinks(line) {
  const links = [];
  for (const start of inlineMarkdownLinkStarts(line)) {
    let cursor = start;
    let target = '';
    if (line[cursor] === '<') {
      const end = line.indexOf('>', cursor + 1);
      if (end === -1) continue;
      target = line.slice(cursor + 1, end);
      cursor = end + 1;
    } else {
      const start = cursor;
      let depth = 0;
      for (; cursor < line.length; cursor += 1) {
        if (line[cursor] === '(') depth += 1;
        else if (line[cursor] === ')') {
          if (depth === 0) break;
          depth -= 1;
        } else if (/\s/u.test(line[cursor]) && depth === 0) break;
      }
      if (depth !== 0) continue;
      target = line.slice(start, cursor);
    }
    if (!target) continue;
    while (/\s/u.test(line[cursor] ?? '')) cursor += 1;
    if (line[cursor] === '"' || line[cursor] === "'") {
      const quote = line[cursor++];
      const end = line.indexOf(quote, cursor);
      if (end === -1) continue;
      cursor = end + 1;
      while (/\s/u.test(line[cursor] ?? '')) cursor += 1;
    }
    if (line[cursor] === ')') links.push(target);
  }
  return links;
}

function inlineMarkdownLinkStarts(line) {
  const starts = [];
  for (let index = 0; index < line.length; index += 1) {
    const opening = line[index] === '!' && line[index + 1] === '[' ? index + 1
      : line[index] === '[' && line[index - 1] !== '!' ? index : -1;
    if (opening === -1 || (opening > 0 && line[opening - 1] === '\\')) continue;
    let cursor = opening + 1;
    let depth = 1;
    for (; cursor < line.length && depth > 0; cursor += 1) {
      if (line[cursor] === '\\') { cursor += 1; continue; }
      if (line[cursor] === '[') depth += 1;
      else if (line[cursor] === ']') depth -= 1;
    }
    if (depth !== 0 || line[cursor] !== '(') continue;
    cursor += 1;
    while (/\s/u.test(line[cursor] ?? '')) cursor += 1;
    starts.push(cursor);
  }
  return starts;
}
export function localLinkPath(document, target) {
  requireCondition(typeof target === 'string' && !target.includes('\\'), 'Markdown links must not contain backslashes');
  const scheme = target.match(/^([A-Za-z][A-Za-z0-9+.-]*):/u);
  if (scheme) {
    requireCondition(['http', 'https', 'mailto'].includes(scheme[1].toLowerCase()), 'unsupported Markdown link scheme');
    return null;
  }
  requireCondition(!target.startsWith('/'), 'absolute local Markdown link is forbidden');
  let decoded;
  try { decoded = decodeURIComponent(target.split(/[?#]/u, 1)[0]); }
  catch { throw new ValidationError('invalid link path encoding'); }
  if (!decoded) return null;
  requireCondition(!decoded.includes('\\') && !decoded.startsWith('/'), 'unsafe encoded link path');
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(document), decoded));
  requireCondition(normalized !== '..' && !normalized.startsWith('../'), 'Markdown link escapes the root');
  if (normalized === '.') return null;
  relativeParts(normalized);
  return normalized;
}
export function checkMarkdown(root, relative, text) {
  let count = 0;
  for (const [line, target] of markdownLinks(text)) {
    try {
      const local = localLinkPath(relative, target);
      if (local !== null) { root.info(local); count += 1; }
    } catch (error) { throw new ValidationError(`${relative}:${line}: invalid local link (${error.message})`); }
  }
  return count;
}

export function htmlLinks(text) {
  const links = [];
  for (const tag of htmlTags(text)) {
    const source = tag.source;
    for (const attribute of source.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu)) {
      const line = text.slice(0, tag.index + attribute.index).split(/\r\n|\n|\r/u).length;
      links.push([line, attribute[1] ?? attribute[2] ?? attribute[3]]);
    }
  }
  return links;
}

function htmlTags(text) {
  const tags = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '<' || !/[A-Za-z]/u.test(text[index + 1] ?? '')) continue;
    let cursor = index + 2;
    while (/[A-Za-z0-9:-]/u.test(text[cursor] ?? '')) cursor += 1;
    let quote = '';
    for (; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') {
        tags.push({ index, source: text.slice(index, cursor + 1) });
        break;
      } else if (character === '<') break;
    }
  }
  return tags;
}
