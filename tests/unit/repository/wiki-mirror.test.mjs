import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WikiMirrorRepository } from '../../../src/repository/WikiMirrorRepository.ts';

test('Wiki mirror rewrites Markdown pages without changing Git metadata or following links', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-mirror-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const git = path.join(root, '.git');
    fs.mkdirSync(git);
    fs.writeFileSync(path.join(git, 'note.md'), '[git](../untouched.md)');
    fs.writeFileSync(path.join(root, 'index.md'), '[source]: ../README.md\n');
    new WikiMirrorRepository().rewrite(root, 'example/skills');
    assert.equal(
        fs.readFileSync(path.join(root, 'index.md'), 'utf8'),
        '[source]: https://github.com/example/skills/blob/main/README.md\n',
    );
    assert.equal(fs.readFileSync(path.join(git, 'note.md'), 'utf8'), '[git](../untouched.md)');
    fs.symlinkSync(path.join(git, 'note.md'), path.join(root, 'unsafe.md'));
    assert.throws(
        () => new WikiMirrorRepository().rewrite(root, 'example/skills'),
        /symbolic links/,
    );
    assert.equal(fs.readFileSync(path.join(git, 'note.md'), 'utf8'), '[git](../untouched.md)');
});
