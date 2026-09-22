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
    const result = new WikiLinkService().rewrite(body, 'docs/index.md', 'example/skills');
    assert.ok(result.includes(`[guide](${prefix}guide(v2).md "Title")`));
    assert.ok(result.includes(`[readme]: ${prefix}README.md#start`));
    assert.ok(result.includes(`[spaced]: <${prefix}guide with spaces.md>`));
    assert.ok(result.includes(`label](${prefix}README.md)`));
    assert.ok(result.includes('`[example](../unchanged.md)`'));
    assert.ok(result.includes('[example]: ../unchanged.md'));
    assert.throws(
        () =>
            new WikiLinkService().rewrite(
                '[bad](../../outside.md)',
                'docs/index.md',
                'example/skills',
            ),
        /escapes/,
    );
});
