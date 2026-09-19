// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
    existsSync,
    symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
function cli(args, cwd) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 10000,
    });
}
function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9 catalog ')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}
function packageAt(root, layout) {
    const directory = join(root, layout === 'global' ? 'skills' : '.agents/skills', 'alpha');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        join(directory, 'SKILL.md'),
        '---\nname: alpha\ndescription: Read a synthetic input.\n---\n# Alpha\n',
    );
    return directory;
}

for (const layout of ['repository', 'global']) {
    test('catalog ' + layout + ' preview is read-only; sync is explicit and idempotent', (t) => {
        const root = fixture(t);
        const packageDirectory = packageAt(root, layout);
        const flags = ['--collection', root, '--layout', layout];
        const preview = cli(['catalog', 'sync', ...flags, '--dry-run'], root);
        assert.equal(preview.status, 0, preview.stderr);
        assert.deepEqual(JSON.parse(preview.stdout).added, ['alpha']);
        assert.equal(JSON.parse(preview.stdout).written, false);
        assert.equal(existsSync(join(root, 'skills-catalog.json')), false);
        assert.notEqual(cli(['catalog', 'check', ...flags], root).status, 0);
        const first = cli(['catalog', 'sync', ...flags], root);
        assert.equal(first.status, 0, first.stderr);
        const before = readFileSync(join(root, 'skills-catalog.json'));
        assert.equal(JSON.parse(cli(['catalog', 'inspect', ...flags], root).stdout).packages, 1);
        assert.equal(cli(['catalog', 'check', ...flags], root).status, 0);
        assert.equal(JSON.parse(cli(['catalog', 'sync', ...flags], root).stdout).changed, false);
        writeFileSync(
            join(packageDirectory, 'SKILL.md'),
            '---\nname: alpha\ndescription: A revised synthetic task.\n---\n# Alpha\n',
        );
        assert.notEqual(cli(['catalog', 'check', ...flags], root).status, 0);
        const stalePreview = cli(['catalog', 'sync', ...flags, '--dry-run'], root);
        assert.deepEqual(JSON.parse(stalePreview.stdout).refreshed, ['alpha']);
        assert.deepEqual(readFileSync(join(root, 'skills-catalog.json')), before);
        const target = join(root, 'another.json');
        writeFileSync(target, before);
        rmSync(join(root, 'skills-catalog.json'));
        symlinkSync(target, join(root, 'skills-catalog.json'));
        assert.notEqual(cli(['catalog', 'sync', ...flags, '--dry-run'], root).status, 0);
        assert.deepEqual(readFileSync(target), before);
    });
}

test('aggregate CLI preserves history and read-only checks while refusing an unapproved reset', (t) => {
    const root = fixture(t);
    const collection = join(root, 'source');
    packageAt(collection, 'repository');
    assert.equal(
        cli(['catalog', 'sync', '--collection', collection, '--layout', 'repository'], root).status,
        0,
    );
    const output = join(root, 'aggregate');
    mkdirSync(output);
    const sources = ['--source', 'fixture=' + join(collection, 'skills-catalog.json')];
    const first = cli(['catalog', 'aggregate', 'sync', ...sources, '--output', output], root);
    assert.equal(first.status, 0, first.stderr);
    const filename = JSON.parse(first.stdout).index;
    assert.equal(
        JSON.parse(cli(['catalog', 'aggregate', 'inspect', '--index', filename], root).stdout)
            .skills,
        1,
    );
    const bytes = readFileSync(filename);
    assert.equal(
        cli(['catalog', 'aggregate', 'check', '--index', filename, ...sources], root).status,
        0,
    );
    assert.deepEqual(readFileSync(filename), bytes);
    const rejected = cli(['catalog', 'aggregate', 'rebuild', ...sources, '--output', output], root);
    assert.notEqual(rejected.status, 0);
    assert.deepEqual(readFileSync(filename), bytes);
    assert.equal(
        cli(['catalog', 'aggregate', 'sync', ...sources, '--output', output], root).status,
        0,
    );
    const database = new DatabaseSync(filename, { readOnly: true });
    try {
        assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sync_runs').get().count, 2);
    } finally {
        database.close();
    }
});
