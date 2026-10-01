// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PluginZipRepository } from '../../../src/repository/PluginZipRepository.ts';

test('ZIP32 output is deterministic and independently extracts exact Unicode, binary and executable bytes', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'i9-zip-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const files = [
        { path: 'skills/example/scripts/run.mjs', mode: 0o755, bytes: Buffer.from('export {};\n') },
        { path: 'plugin.json', mode: 0o644, bytes: Buffer.from('{"name":"example"}\n') },
        {
            path: 'skills/example/assets/icon.png',
            mode: 0o644,
            bytes: Buffer.from([0, 255, 1, 254]),
        },
        { path: 'skills/example/references/ação.md', mode: 0o644, bytes: Buffer.from('# Café\n') },
    ];
    const repository = new PluginZipRepository();
    const zip = repository.archive(files);
    assert.deepEqual(repository.archive([...files].reverse()), zip);
    const archive = join(root, 'candidate.zip');
    repository.write(archive, zip);
    assert.deepEqual(readFileSync(archive), zip);
    assert.equal(statSync(archive).mode & 0o777, 0o600);
    const checked = spawnSync('unzip', ['-t', archive], { encoding: 'utf8', timeout: 5000 });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout || String(checked.error));
    const extracted = join(root, 'extracted');
    const result = spawnSync('unzip', ['-q', archive, '-d', extracted], {
        encoding: 'utf8',
        timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    for (const file of files) {
        assert.deepEqual(readFileSync(join(extracted, file.path)), file.bytes);
        assert.equal(statSync(join(extracted, file.path)).mode & 0o777, file.mode);
        assert.equal(statSync(join(extracted, file.path)).mtime.getUTCFullYear(), 1980);
    }
    writeFileSync(join(root, 'sentinel'), 'preserve');
    assert.throws(() => repository.write(archive, zip), /appeared/u);
    assert.deepEqual(readFileSync(archive), zip);
});

for (const [label, files] of [
    ['empty archive', []],
    [
        'duplicate names',
        [
            { path: 'x', mode: 0o644, bytes: Buffer.alloc(0) },
            { path: 'x', mode: 0o644, bytes: Buffer.alloc(0) },
        ],
    ],
    ['traversal', [{ path: '../escape', mode: 0o644, bytes: Buffer.alloc(0) }]],
    ['absolute path', [{ path: '/escape', mode: 0o644, bytes: Buffer.alloc(0) }]],
    ['link mode', [{ path: 'x', mode: 0o777, bytes: Buffer.alloc(0) }]],
    ['oversized file', [{ path: 'x', mode: 0o644, bytes: Buffer.alloc(4 * 1024 * 1024 + 1) }]],
    [
        'excessive count',
        Array.from({ length: 10_001 }, (_, index) => ({
            path: String(index),
            mode: 0o644,
            bytes: Buffer.alloc(0),
        })),
    ],
    [
        'excessive total content',
        Array.from({ length: 17 }, (_, index) => ({
            path: String(index),
            mode: 0o644,
            bytes: Buffer.alloc(4 * 1024 * 1024),
        })),
    ],
]) {
    test(`ZIP rejects ${label} before writing`, () => {
        assert.throws(() => new PluginZipRepository().archive(files));
    });
}

test('ZIP rejects occupied sidecars during preview and preserves their bytes', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'i9-zip-output-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const name of ['i9-skills.zip', 'i9-skills-submission.json']) {
        writeFileSync(join(root, name), 'preserve');
        assert.throws(
            () => new PluginZipRepository().destinations(join(root, 'i9-skills')),
            /already exists/u,
        );
        assert.equal(readFileSync(join(root, name), 'utf8'), 'preserve');
        rmSync(join(root, name));
    }
});
