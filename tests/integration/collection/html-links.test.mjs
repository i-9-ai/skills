import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { htmlLinks, markdownLinks, localLinkPath } from '../../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

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

test('HTML resource entities are decoded before scheme checks or rejected explicitly', () => {
    const [[, target]] = htmlLinks('<a href="javascript&colon;alert(1)">Active</a>');
    assert.equal(target, 'javascript:alert(1)');
    assert.throws(() => localLinkPath('SKILL.md', target), /scheme/);
    assert.deepEqual(htmlLinks('<img src="assets&sol;image.png"><a href="a&amp;b.html">Guide</a>'), [[1, 'assets/image.png'], [1, 'a&b.html']]);
    assert.throws(() => htmlLinks('<img src="unknown&NotEqual;value.png">'), /unsupported named HTML/);
});

test('HTML local bases preserve URL dot-segment, file and empty-reference semantics', () => {
    const document = 'docs/index.html';
    for (const base of ['sub/..', 'sub//..', 'sub///..', 'sub//%2e%2e', 'sub/.', 'sub/%2e%2e', 'sub/.%2E', './', 'guide.html', 'sub/../guide.html', '../__relative_url_parent__/guide.html']) {
        for (const href of ['target.html', '', '?view=1', '#section', '.', 'sub/..']) {
            const [[, target]] = htmlLinks(`<base href="${base}"><a href="${href}">Guide</a>`);
            const resolved = new URL(href, new URL(base, `https://example.test/${document}`));
            const expected = path.posix.normalize(decodeURIComponent(resolved.pathname)).replace(/^\/|\/$/gu, '');
            assert.equal(localLinkPath(document, target), expected, `${base} + ${href}`);
        }
    }
    assert.deepEqual(htmlLinks('<base href=""><a href="">Self</a>'), [[1, '']]);
    assert.throws(() => localLinkPath(document, htmlLinks('<base href="sub/../../.."><a href="target.html">Outside</a>')[0][1]), /escapes the root/);
});

test('Markdown link discovery preserves balanced destination parentheses', () => {
    assert.deepEqual(markdownLinks('[Guide](guide(v2).md)'), [[1, 'guide(v2).md']]);
});

test('Markdown link discovery preserves balanced nested labels', () => {
    assert.deepEqual(markdownLinks('[a [b]](missing.md)'), [[1, 'missing.md']]);
});
