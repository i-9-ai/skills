// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-pilot-cli-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}

function cli(root, args) {
    return spawnSync(process.execPath, [launcher, 'plugin', 'pilot', ...args], {
        cwd: root,
        encoding: 'utf8',
        timeout: 15_000,
        env: { PATH: process.env.PATH, HOME: root, NO_COLOR: '1', NODE_NO_WARNINGS: '1' },
    });
}

test('native pilot help describes explicit execution without creating caller state', (t) => {
    const root = fixture(t);
    const result = cli(root, ['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--request/);
    assert.match(result.stdout, /--execute/);
    assert.match(result.stdout, /disposable/);
    assert.deepEqual(readdirSync(root), []);
});

test('omitted execution opt-in rejects before reading even a nonexistent request', (t) => {
    const root = fixture(t);
    const result = cli(root, ['--request', join(root, 'missing.json')]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires --execute/);
    assert.deepEqual(readdirSync(root), []);
});

test('a malformed explicit request cannot reach preparation or native execution', (t) => {
    const root = fixture(t);
    const request = join(root, 'operator.json');
    writeFileSync(request, JSON.stringify({ schema_version: 1, arbitrary_command: 'fixture' }));
    const result = cli(root, ['--request', request, '--execute']);
    assert.notEqual(result.status, 0);
    assert.deepEqual(readdirSync(root), ['operator.json']);
    assert.equal(result.stdout, '');
});
