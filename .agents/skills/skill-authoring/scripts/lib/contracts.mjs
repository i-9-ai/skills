/** Pure structural contracts. No filesystem, process execution, or network access. */
import path from 'node:path';

export const LIMITS = Object.freeze({
  textBytes: 262_144, jsonBytes: 1_048_576, artifactBytes: 4_194_304,
  totalBytes: 33_554_432, entries: 2048, depth: 24, jsonDepth: 64,
});
export const STAGES = Object.freeze(['intake', 'discovery', 'domain-research', 'synthesis', 'design', 'authoring', 'evaluation']);
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
  requireCondition(parts.every(part => !/[<>:"|?*]/u.test(part) && !/[. ]$/u.test(part)
    && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part)),
    'path contains a nonportable filename component');
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
    output += line.slice(cursor, end + width).replace(/[^\r\n]/g, ' ');
    cursor = end + width;
  }
  return output;
}

/** Preserve source offsets while excluding fenced and inline code examples. */
function visibleMarkdown(text) {
  let fence = null;
  let paragraphOpen = false;
  const listStack = [];
  const lines = text.split(/(\r\n|\n|\r)/u);
  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index];
    const quotePrefix = line.match(/^(?: {0,3}>[ \t]?)*/u)[0];
    const quoteDepth = (quotePrefix.match(/>/gu) ?? []).length;
    if (fence !== null && fence.quoteDepth > quoteDepth) fence = null;
    const marker = line.slice(quotePrefix.length).match(/^ {0,3}(`{3,}|~{3,})/u);
    if (marker) {
      paragraphOpen = false;
      const run = marker[1];
      if (fence === null) fence = { run, quoteDepth };
      else if (quoteDepth === fence.quoteDepth && run[0] === fence.run[0] && run.length >= fence.run.length) fence = null;
      lines[index] = ' '.repeat(line.length);
      continue;
    }
    if (fence !== null) {
      lines[index] = ' '.repeat(line.length);
      continue;
    }
    if (!line.trim()) {
      paragraphOpen = false;
      continue;
    }

    const indentation = line.match(/^[ \t]*/u)[0].replace(/\t/g, '    ').length;
    const listMarker = line.match(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/u);
    while (listStack.length && indentation < listStack.at(-1).contentIndent && (!paragraphOpen || listMarker)) listStack.pop();

    const parent = listStack.at(-1);
    if (listMarker && (indentation < 4 || (parent && indentation < parent.contentIndent + 4))) {
      const markerIndent = listMarker[0].replace(/\t/g, '    ').length;
      listStack.push({ contentIndent: markerIndent });
      paragraphOpen = line.slice(listMarker[0].length).trim().length > 0;
      continue;
    }

    const codeIndent = listStack.length ? listStack.at(-1).contentIndent + 4 : 4;
    if (indentation >= codeIndent && !paragraphOpen) {
      lines[index] = ' '.repeat(line.length);
      continue;
    }
    const paragraph = line.replace(/^\s{0,3}>[ \t]?/u, '');
    const quotedList = line !== paragraph && paragraph.match(/^\s{0,3}(?:[-+*]|\d+[.)])[ \t]+/u);
    if (quotedList) {
      paragraphOpen = paragraph.slice(quotedList[0].length).trim().length > 0;
      continue;
    }
    paragraphOpen = paragraph.trim().length > 0 && !/^\s{0,3}(?:#{1,6}\s|-{3,}\s*$|\*{3,}\s*$)/u.test(paragraph);
  }
  return stripInlineCode(lines.join(''));
}

/** Ordinary Markdown links, reference definitions, and resource-bearing HTML. */
export function markdownLinks(text) {
  const visible = visibleMarkdown(text);
  const lineAt = lineNumberLookup(visible);
  const links = markdownLinkRanges(text).map(({ start, target }) => [lineAt(start), urlReference(htmlAttributeValue(target))]);
  return links.concat(htmlLinks(visible)).sort(([left], [right]) => left - right);
}

/** Raw destination ranges permit meaning-preserving rewrites outside examples. */
export function markdownLinkRanges(text) {
  const visible = visibleMarkdown(text);
  const links = inlineMarkdownLinks(visible);
  for (const match of visible.matchAll(/^[ \t]{0,3}\[[^\[\]\r\n]+\]:[ \t]*(?:<([^>]+)>|(\S+))/gmu)) {
    const target = match[1] ?? match[2];
    const start = match.index + match[0].lastIndexOf(target);
    links.push({ start, end: start + target.length, target });
  }
  return links.sort((left, right) => left.start - right.start);
}

function inlineMarkdownLinks(line) {
  const links = [];
  for (const start of inlineMarkdownLinkStarts(line)) {
    let cursor = start;
    let targetStart = start;
    let target = '';
    if (line[cursor] === '<') {
      targetStart += 1;
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
    if (line[cursor] === '"' || line[cursor] === "'" || line[cursor] === '(') {
      const opening = line[cursor];
      const closing = opening === '(' ? ')' : opening;
      cursor += 1;
      let end = cursor;
      while (end < line.length && line[end] !== closing) {
        if (line[end] === '\\') end += 1;
        end += 1;
      }
      if (end >= line.length) continue;
      cursor = end + 1;
      while (/\s/u.test(line[cursor] ?? '')) cursor += 1;
    }
    if (line[cursor] === ')') links.push({ start: targetStart, end: targetStart + target.length, target });
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

function lineNumberLookup(text) {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\n|\r/gu)) starts.push(match.index + match[0].length);
  return index => {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= index) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

function htmlAttributeValue(value) {
  return value.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|([a-z][a-z0-9]*));/giu, (entity, numeric, named) => {
    if (named) {
      const references = { amp: '&', AMP: '&', quot: '"', QUOT: '"', apos: "'", lt: '<', LT: '<', gt: '>', GT: '>', colon: ':', sol: '/', bsol: '\\', Tab: '\t', NewLine: '\n' };
      requireCondition(Object.hasOwn(references, named), 'unsupported named HTML character reference in resource attribute');
      return references[named];
    }
    const code = numeric[0].toLowerCase() === 'x' ? Number.parseInt(numeric.slice(1), 16) : Number(numeric);
    requireCondition(code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff), 'invalid HTML character reference');
    return String.fromCodePoint(code);
  });
}

/** URL parsers trim surrounding ASCII whitespace and ignore embedded tab/CR/LF. */
function urlReference(value) {
  return value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/gu, '').replace(/[\t\r\n]/gu, '');
}

function srcsetTargets(value) {
  const targets = [];
  let cursor = 0;
  while (cursor < value.length) {
    while (/[\s,]/u.test(value[cursor] ?? '')) cursor += 1;
    const start = cursor;
    while (cursor < value.length && !/\s/u.test(value[cursor])) cursor += 1;
    const token = value.slice(start, cursor);
    if (!token) break;
    targets.push(token.replace(/,+$/u, ''));
    if (token.endsWith(',')) continue;
    while (cursor < value.length && value[cursor] !== ',') cursor += 1;
  }
  return targets;
}

export function htmlLinks(text) {
  const lineAt = lineNumberLookup(text);
  const links = [];
  let base;
  for (const tag of htmlTags(text)) {
    const attributes = tag.source.slice(tag.name.length + 1);
    for (const attribute of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
      const name = attribute[1].toLowerCase();
      if (!['href', 'src', 'poster', 'srcset', 'imagesrcset'].includes(name)) continue;
      const raw = attribute[2] ?? attribute[3] ?? attribute[4];
      if (raw === undefined) continue;
      const value = htmlAttributeValue(raw);
      if (tag.name === 'base' && name === 'href') {
        if (base === undefined) base = urlReference(value);
        continue;
      }
      const targets = name.endsWith('srcset') ? srcsetTargets(value) : [value];
      const line = lineAt(tag.index + tag.name.length + 1 + attribute.index);
      for (const target of targets) links.push([line, urlReference(target)]);
    }
  }
  if (base !== undefined) {
    const basePath = base.split(/[?#]/u, 1)[0];
    const hasScheme = value => /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
    if (hasScheme(base)) {
      requireCondition(/^https?:/iu.test(base), 'unsupported HTML base scheme');
      return links.map(([line, target]) => [line, new URL(target, base).href]);
    }
    requireCondition(!base.startsWith('/') && !base.includes('\\'), 'HTML base must be a relative local path or public URL');
    // Resolve with the native URL algorithm before filesystem normalization.
    // Enough artificial parents prevent URL's origin-root clamping from hiding
    // traversal. Size each local resolution independently of unrelated URLs.
    const baseDepth = basePath.split('/').length;
    return links.map(([line, target]) => {
      if (hasScheme(target) || target.startsWith('/')) return [line, target];
      requireCondition(!target.includes('\\'), 'HTML resource paths must not contain backslashes');
      if (!basePath && (!target || /^[?#]/u.test(target))) return [line, target];

      let marker = 0;
      let segment = `__relative_url_parent_${marker}__`;
      while (base.includes(segment) || target.includes(segment)) {
        marker += 1;
        segment = `__relative_url_parent_${marker}__`;
      }
      const depth = baseDepth + target.split(/[?#]/u, 1)[0].split('/').length + 1;
      const anchor = `/${`${segment}/`.repeat(depth)}`;
      const origin = new URL(`https://relative.invalid${anchor}document.html`);
      const resolvedBase = new URL(base, origin);
      const resolved = new URL(target, resolvedBase);
      const relative = path.posix.relative(anchor, resolved.pathname) || '.';
      return [line, `./${relative}${resolved.search}${resolved.hash}`];
    });
  }
  return links;
}

function htmlTags(text) {
  const tags = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    if (text[index] !== '<' || !/[A-Za-z]/u.test(text[index + 1] ?? '')) continue;
    let cursor = index + 2;
    while (/[A-Za-z0-9:-]/u.test(text[cursor] ?? '')) cursor += 1;
    const name = text.slice(index + 1, cursor).toLowerCase();
    let quote = '';
    for (; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') {
        tags.push({ index, name, source: text.slice(index, cursor + 1) });
        index = cursor;
        if (['script', 'style', 'textarea', 'title'].includes(name)) {
          const close = new RegExp(`</${name}\\s*>`, 'giu');
          close.lastIndex = cursor + 1;
          const match = close.exec(text);
          index = match ? match.index + match[0].length - 1 : text.length;
        }
        break;
      } else if (character === '<') break;
    }
  }
  return tags;
}
