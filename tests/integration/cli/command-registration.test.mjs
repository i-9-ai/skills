// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { COMMANDS } from '../../../src/index.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

function cli(args) {
    return spawnSync(process.execPath, [join(repository, 'bin/index.mjs'), ...args], {
        cwd: repository,
        encoding: 'utf8',
        timeout: 10000,
    });
}

test('each named command is registered once independently of its matching filename', () => {
    const files = readdirSync(join(repository, 'src/command'), { recursive: true })
        .filter((file) => file.endsWith('.ts'))
        .map((file) => basename(file, '.ts'))
        .sort();
    const classes = Object.values(COMMANDS)
        .map((command) => command.name)
        .sort();
    assert.deepEqual(files, classes, 'no orphaned, duplicate or route-named command files');
    for (const name of classes) assert.match(name, /^[A-Z]\w+Command$/u);
});

test('all explicitly registered routes render help without running their operation', () => {
    for (const route of Object.keys(COMMANDS)) {
        const result = cli([...route.split(':'), '--help']);
        assert.equal(result.status, 0, `${route}: ${result.stderr}`);
        assert.match(result.stdout, /USAGE/u, route);
        assert.ok(result.stdout.includes(`i9-skills ${route.replaceAll(':', ' ')}`), route);
    }
});

test('validation routes disclose their requirements and obsolete routes fail', () => {
    const local = cli(['repo', 'validate']);
    assert.notEqual(local.status, 0);
    assert.match(local.stderr, /Missing required flag project/u);
    const official = cli(['repo', 'validate-official', '--help']);
    assert.equal(official.status, 0, official.stderr);
    assert.match(official.stdout, /Agent Skills/u);
    assert.match(official.stdout, /Requires Python/u);
    for (const route of ['validate', 'ci-official', 'RepositoryValidateCommand']) {
        const result = cli([route, '--help']);
        assert.notEqual(result.status, 0, `${route} must not resolve implicitly`);
    }
});
