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

test('Wiki synchronization excludes agent instructions and removes stale Wiki copies', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-sync-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const docs = path.join(root, 'docs');
    const wiki = path.join(root, 'wiki');
    fs.mkdirSync(path.join(docs, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(wiki, '.git'), { recursive: true });
    fs.mkdirSync(path.join(wiki, 'nested'));
    fs.writeFileSync(path.join(docs, 'Home.md'), '# Home\n[Page](nested/Page.md)\n');
    fs.writeFileSync(path.join(docs, 'AGENTS.md'), 'private instructions\n');
    fs.writeFileSync(path.join(docs, 'nested/AGENTS.md'), 'nested instructions\n');
    fs.writeFileSync(path.join(docs, 'nested/Page.md'), '[source](../../README.md)\n');
    fs.writeFileSync(path.join(wiki, 'AGENTS.md'), 'stale instructions\n');
    fs.writeFileSync(path.join(wiki, 'nested/AGENTS.md'), 'stale nested instructions\n');
    fs.writeFileSync(path.join(wiki, '.git/config'), 'preserve');
    fs.symlinkSync(path.join(wiki, '.git/config'), path.join(wiki, 'old-page.md'));

    new WikiMirrorRepository().synchronize(docs, wiki, 'example/skills');

    assert.equal(
        fs.readFileSync(path.join(wiki, 'Home.md'), 'utf8'),
        '# Home\n[Page](https://github.com/example/skills/wiki/Page)\n',
    );
    assert.equal(fs.readFileSync(path.join(wiki, '.git/config'), 'utf8'), 'preserve');
    assert.equal(fs.existsSync(path.join(wiki, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(wiki, 'nested/AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(wiki, 'old-page.md')), false);
    assert.match(
        fs.readFileSync(path.join(wiki, 'nested/Page.md'), 'utf8'),
        /https:\/\/github\.com\/example\/skills\/blob\/main\/README\.md/,
    );
});

test('Wiki synchronization rejects incomplete documentation before deleting pages', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-sync-reject-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const docs = path.join(root, 'docs');
    const wiki = path.join(root, 'wiki');
    fs.mkdirSync(docs);
    fs.mkdirSync(path.join(wiki, '.git'), { recursive: true });
    fs.writeFileSync(path.join(wiki, 'preserve.md'), 'preserve\n');
    assert.throws(
        () => new WikiMirrorRepository().synchronize(docs, wiki, 'example/skills'),
        /Home\.md/,
    );
    assert.equal(fs.readFileSync(path.join(wiki, 'preserve.md'), 'utf8'), 'preserve\n');
});
