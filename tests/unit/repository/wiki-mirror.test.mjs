import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('Wiki sync excludes project instructions and removes stale Wiki copies', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-sync-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const docs = path.join(root, 'docs');
    const wiki = path.join(root, 'wiki');
    fs.mkdirSync(path.join(docs, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(wiki, '.git'), { recursive: true });
    fs.mkdirSync(path.join(wiki, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(docs, 'Home.md'), '# Home\n');
    fs.writeFileSync(path.join(docs, 'AGENTS.md'), 'private instructions\n');
    fs.writeFileSync(path.join(docs, 'nested/AGENTS.md'), 'nested instructions\n');
    fs.writeFileSync(path.join(wiki, 'AGENTS.md'), 'stale instructions\n');
    fs.writeFileSync(path.join(wiki, 'nested/AGENTS.md'), 'stale nested instructions\n');
    fs.mkdirSync(path.join(wiki, 'other'));
    fs.symlinkSync(path.join(wiki, '.git/config'), path.join(wiki, 'other/AGENTS.md'));
    fs.writeFileSync(path.join(wiki, '.git/config'), 'preserve');

    const copy = spawnSync('rsync', [
        '-a',
        '--delete',
        '--exclude=.git/',
        '--exclude=AGENTS.md',
        `${docs}/`,
        `${wiki}/`,
    ]);
    assert.equal(copy.status, 0, copy.stderr?.toString());
    const clean = spawnSync('find', [
        wiki,
        '-name',
        '.git',
        '-prune',
        '-o',
        '-name',
        'AGENTS.md',
        '-exec',
        'rm',
        '-f',
        '--',
        '{}',
        '+',
    ]);
    assert.equal(clean.status, 0, clean.stderr?.toString());

    assert.equal(fs.readFileSync(path.join(wiki, 'Home.md'), 'utf8'), '# Home\n');
    assert.equal(fs.readFileSync(path.join(wiki, '.git/config'), 'utf8'), 'preserve');
    assert.equal(fs.existsSync(path.join(wiki, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(wiki, 'nested/AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(wiki, 'other/AGENTS.md')), false);
});
