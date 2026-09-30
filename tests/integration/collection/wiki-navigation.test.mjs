import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { markdownLinkRanges } from '../../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

test('public documentation links name existing rendered Wiki pages without Markdown suffixes or encoded spaces', () => {
  const docs = fileURLToPath(new URL('../../../docs/', import.meta.url));
  const pages = fs.readdirSync(docs).filter(name => name.endsWith('.md'));
  const titles = new Set(pages.map(name => name.slice(0, -3).replaceAll(' ', '-')));
  let observed = 0;
  for (const page of pages) {
    for (const link of markdownLinkRanges(fs.readFileSync(path.join(docs, page), 'utf8'))) {
      assert.equal(/^(?:\.?\/?|\.\.\/)[^:#?]*\.md(?:[?#]|$)/i.test(link.target), false,
        `${page} must use a rendered page or explicit source-file URL`);
      if (!link.target.startsWith('https://github.com/i-9-ai/skills/wiki/')) continue;
      const title = new URL(link.target).pathname.slice('/i-9-ai/skills/wiki/'.length);
      assert.match(title, /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/);
      assert.ok(titles.has(title), `${page} references an unknown Wiki title`);
      observed += 1;
    }
  }
  assert.ok(observed > 0, 'the documentation must exercise rendered Wiki navigation');
});
