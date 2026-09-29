// SPDX-License-Identifier: Apache-2.0
/** Package-local, bounded JSON reader; ambiguous keys never select a scope. */
export function strictJson(bytes) {
  if (bytes.byteLength > 1024 * 1024) throw new Error('contract exceeds 1048576 bytes');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let cursor = 0;
  const fail = () => { throw new Error('invalid contract JSON'); };
  const whitespace = () => { while (cursor < text.length && /[ \t\r\n]/u.test(text[cursor])) cursor += 1; };

  function string() {
    if (text[cursor] !== '"') fail();
    const start = cursor++;
    while (cursor < text.length) {
      if (text[cursor] === '\\') { cursor += 2; continue; }
      if (text[cursor++] !== '"') continue;
      const result = JSON.parse(text.slice(start, cursor));
      if (!result.isWellFormed()) fail();
      return result;
    }
    fail();
  }

  function value(depth) {
    if (depth > 64) fail();
    whitespace();
    const character = text[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1;
      whitespace();
      const object = {};
      const seen = new Set();
      if (text[cursor] === '}') { cursor += 1; return object; }
      while (cursor < text.length) {
        whitespace();
        const key = string();
        if (seen.has(key)) throw new Error('duplicate contract JSON field');
        seen.add(key);
        whitespace();
        if (text[cursor++] !== ':') fail();
        Object.defineProperty(object, key, { value: value(depth + 1), enumerable: true });
        whitespace();
        const delimiter = text[cursor++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    if (character === '[') {
      cursor += 1;
      whitespace();
      const array = [];
      if (text[cursor] === ']') { cursor += 1; return array; }
      while (cursor < text.length) {
        array.push(value(depth + 1));
        whitespace();
        const delimiter = text[cursor++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (!text.startsWith(literal, cursor)) continue;
      cursor += literal.length;
      return result;
    }
    const number = text.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!number) fail();
    cursor += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result)) fail();
    return result;
  }

  const result = value(0);
  whitespace();
  if (cursor !== text.length) fail();
  return result;
}
