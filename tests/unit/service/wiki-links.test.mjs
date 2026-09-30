import assert from 'node:assert/strict';
import test from 'node:test';
import { WikiLinkService } from '../../../src/service/WikiLinkService.ts';

test('Wiki rewriting preserves balanced destinations, references, titles and code examples', () => {
    const body = [
        '[guide](../guide(v2).md "Title")',
        '[readme]: ../README.md#start',
        '[spaced]: <../guide with spaces.md>',
        '[wrapped',
        'label](../README.md)',
        '`[example](../unchanged.md)`',
        '```md',
        '[example]: ../unchanged.md',
        '```',
    ].join('\n');
    const prefix = 'https://github.com/example/skills/blob/main/';
    const result = new WikiLinkService().rewrite(body, 'docs/Home.md', 'example/skills');
    assert.ok(result.includes(`[guide](${prefix}guide(v2).md "Title")`));
    assert.ok(result.includes(`[readme]: ${prefix}README.md#start`));
    assert.ok(result.includes(`[spaced]: <${prefix}guide%20with%20spaces.md>`));
    assert.ok(result.includes(`label](${prefix}README.md)`));
    assert.ok(result.includes('`[example](../unchanged.md)`'));
    assert.ok(result.includes('[example]: ../unchanged.md'));
    assert.throws(
        () =>
            new WikiLinkService().rewrite(
                '[bad](../../outside.md)',
                'docs/Home.md',
                'example/skills',
            ),
        /escapes/,
    );
});

test('Wiki rewriting preserves offsets after Unicode code spans and follows nested lists', () => {
    const source =
        '`😀` [Repository](../README.md)\n- Parent\n    - Nested paragraph\n      [Nested](../README.md)\n';
    const result = new WikiLinkService().rewrite(source, 'docs/Home.md', 'example/skills');
    const target = 'https://github.com/example/skills/blob/main/README.md';
    assert.equal(
        result,
        `\`😀\` [Repository](${target})\n- Parent\n    - Nested paragraph\n      [Nested](${target})\n`,
    );
});

test('Wiki rewriting follows indented continuation of an open paragraph', () => {
    const source = 'Read\n    [the guide](../README.md)\n';
    const result = new WikiLinkService().rewrite(source, 'docs/Home.md', 'example/skills');
    assert.equal(
        result,
        'Read\n    [the guide](https://github.com/example/skills/blob/main/README.md)\n',
    );
});

test('Wiki rewriting follows an indented lazy blockquote continuation', () => {
    const source = '> Read\n    [the guide](../README.md)\n';
    const result = new WikiLinkService().rewrite(source, 'docs/Home.md', 'example/skills');
    assert.equal(
        result,
        '> Read\n    [the guide](https://github.com/example/skills/blob/main/README.md)\n',
    );
});

test('Wiki rewriting preserves a parenthesized link title', () => {
    const result = new WikiLinkService().rewrite(
        '[Guide](../README.md (caption))',
        'docs/Home.md',
        'example/skills',
    );
    assert.equal(
        result,
        '[Guide](https://github.com/example/skills/blob/main/README.md (caption))',
    );
});

test('Wiki page links use rendered title URLs while assets, anchors and examples stay intact', () => {
    const source = [
        '[Architecture](Architecture.md#boundaries "Architecture")',
        '[CLI](Distribution%20Readiness.md?plain=1#run)',
        '[home]: <./Home.md>',
        '[guide](assets/index.html)',
        '[anchor](#start)',
        '[external](https://example.com/Guide.md)',
        '`[example](Architecture.md)`',
        '```md',
        '[example](Architecture.md)',
        '```',
    ].join('\n');
    const result = new WikiLinkService().rewrite(source, 'docs/Home.md', 'example/skills');
    assert.ok(
        result.includes(
            '[Architecture](https://github.com/example/skills/wiki/Architecture#boundaries "Architecture")',
        ),
    );
    assert.ok(
        result.includes(
            '[CLI](https://github.com/example/skills/wiki/Distribution-Readiness?plain=1#run)',
        ),
    );
    assert.ok(result.includes('[home]: <https://github.com/example/skills/wiki/Home>'));
    for (const unchanged of source.split('\n').slice(3)) assert.ok(result.includes(unchanged));
});

test('Wiki page resolution follows nested source paths and rejects encoded traversal', () => {
    const service = new WikiLinkService();
    assert.equal(
        service.rewrite(
            '[home](../Home.md) [page](Page%20Title.md)',
            'docs/nested/Index.md',
            'example/skills',
        ),
        '[home](https://github.com/example/skills/wiki/Home) [page](https://github.com/example/skills/wiki/Page-Title)',
    );
    assert.throws(
        () =>
            service.rewrite('[escape](%2e%2e/%2e%2e/private.md)', 'docs/Home.md', 'example/skills'),
        /escapes/,
    );
});
