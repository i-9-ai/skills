import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlLinks, markdownLinks } from '../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

test('HTML link discovery accepts quoted and unquoted href attributes only inside tags', () => {
  const links = htmlLinks([
    '<a href="quoted.html">Quoted</a>',
    "<a href='single.html'>Single</a>",
    '<a href=plain.html>Plain</a>',
    'const href = url;',
    '<div data-href=ignored.html></div>',
  ].join('\n'));

  assert.deepEqual(links, [[1, 'quoted.html'], [2, 'single.html'], [3, 'plain.html']]);
});

test('HTML link discovery keeps scanning through quoted greater-than signs', () => {
  assert.deepEqual(htmlLinks('<a title="1 > 0" href="missing.html">Missing</a>'), [[1, 'missing.html']]);
});

test('Markdown link discovery preserves balanced destination parentheses', () => {
  assert.deepEqual(markdownLinks('[Guide](guide(v2).md)'), [[1, 'guide(v2).md']]);
});
