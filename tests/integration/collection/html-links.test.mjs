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

test('HTML resource entities are decoded once before scheme checks and unknown names stay literal', () => {
    const [[, target]] = htmlLinks('<a href="javascript&colon;alert(1)">Active</a>');
    assert.equal(target, 'javascript:alert(1)');
    assert.throws(() => localLinkPath('SKILL.md', target), /scheme/);
    assert.deepEqual(htmlLinks('<img src="assets&sol;image.png"><a href="a&amp;b.html">Guide</a>'), [[1, 'assets/image.png'], [1, 'a&b.html']]);
    assert.deepEqual(htmlLinks('<img src="known&NotEqual;value.png">'), [[1, 'known≠value.png']]);
    assert.deepEqual(htmlLinks('<img src="unknown&NotAReference;value.png">'), [[1, 'unknown&NotAReference;value.png']]);
    assert.deepEqual(htmlLinks('<img src="literal&amp;copy;value.png">'), [[1, 'literal&copy;value.png']]);
});

test('HTML local bases preserve URL dot-segment, file and empty-reference semantics', () => {
    const document = 'docs/index.html';
    for (const base of ['sub/..', 'sub//..', 'sub///..', 'sub//%2e%2e', 'sub/.', 'sub/%2e%2e', 'sub/.%2E', './', 'guide.html', 'sub/../guide.html', '../__relative_url_parent_0__/guide.html']) {
        for (const href of ['target.html', '', '?view=1', '#section', '.', 'sub/..', '../__relative_url_parent_0__/target.html']) {
            const [[, target]] = htmlLinks(`<base href="${base}"><a href="${href}">Guide</a>`);
            const resolved = new URL(href, new URL(base, `https://example.test/${document}`));
            const expected = path.posix.normalize(decodeURIComponent(resolved.pathname)).replace(/^\/|\/$/gu, '');
            assert.equal(localLinkPath(document, target), expected, `${base} + ${href}`);
        }
    }
    assert.deepEqual(htmlLinks('<base href=""><a href="">Self</a>'), [[1, '']]);
    assert.throws(() => localLinkPath(document, htmlLinks('<base href="sub/../../.."><a href="target.html">Outside</a>')[0][1]), /escapes the root/);
});

test('Markdown character references resolve once before scheme and path validation', () => {
    for (const target of ['javascript&colon;alert(1)', 'javascript&#58;alert(1)', 'java&#x73;cript:alert(1)', 'java&Tab;script&colon;alert(1)']) {
        for (const markup of [`[Link](${target})`, `[Link]: ${target}`]) {
            const [[, decoded]] = markdownLinks(markup);
            assert.throws(() => localLinkPath('SKILL.md', decoded), /scheme/);
        }
    }
    assert.deepEqual(markdownLinks('[A](references/a&amp;b.md)\n[B]: references/file&#46;md'),
        [[1, 'references/a&b.md'], [2, 'references/file.md']]);
    assert.deepEqual(markdownLinks('[Literal](a&amp;colon;b.md)'), [[1, 'a&colon;b.md']]);
    assert.throws(() => localLinkPath('SKILL.md', markdownLinks('[Outside](&#46;&#46;&sol;outside.md)')[0][1]), /escapes/);
});

test('HTML URL normalization applies without a base and keeps encoded spaces in filenames', () => {
    for (const target of [' javascript:alert(1)', 'java&#9;script:alert(1)', 'java\r\nscript:alert(1)', '\t&#106;avascript:alert(1) ']) {
        const [[, decoded]] = htmlLinks(`<a href="${target}">Link</a>`);
        assert.throws(() => localLinkPath('SKILL.md', decoded), /scheme/);
    }
    assert.deepEqual(htmlLinks('<a href="\t docs/guide.md\r\n ">Guide</a>'), [[1, 'docs/guide.md']]);
    assert.equal(localLinkPath('SKILL.md', htmlLinks('<a href="%20guide.md">Guide</a>')[0][1]), ' guide.md');
    assert.throws(() => localLinkPath('docs/index.html', htmlLinks('<a href="./notes:2026.html">Guide</a>')[0][1]), /nonportable/);
});

test('HTML base resolution bounds work independently of unrelated external URLs', () => {
    const external = `https://example.org/__relative_url_parent__${'_'.repeat(24000)}${'/'.repeat(24000)}`;
    const localLinks = '<a href="target.html">Local</a>'.repeat(1000);
    const links = htmlLinks(`<base href="./"><a href="${external}">External</a>${localLinks}`);

    assert.equal(links[0][1], external);
    assert.equal(links.length, 1001);
    assert.ok(links.slice(1).every(([, target]) => localLinkPath('docs/index.html', target) === 'docs/target.html'));
});

test('Markdown link discovery preserves balanced destination parentheses', () => {
    assert.deepEqual(markdownLinks('[Guide](guide(v2).md)'), [[1, 'guide(v2).md']]);
});

test('Markdown link discovery preserves balanced nested labels', () => {
    assert.deepEqual(markdownLinks('[a [b]](missing.md)'), [[1, 'missing.md']]);
});
