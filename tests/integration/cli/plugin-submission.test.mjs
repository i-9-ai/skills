// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { submissionFixture } from '../../unit/fixture/PluginSubmissionFixture.mjs';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
function cli(target, options) {
    return spawnSync(
        process.execPath,
        [launcher, 'plugin', 'submission', '--root', target.source, ...options],
        {
            cwd: target.root,
            env: target.environment,
            encoding: 'utf8',
            timeout: 15_000,
        },
    );
}
test('submission CLI is preview-first, explicit-write and does not submit or install', (t) => {
    const target = submissionFixture(t);
    const help = cli(target, ['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--write/u);
    const preview = cli(target, ['--output', target.output]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).written, false);
    assert.equal(existsSync(target.output), false);
    const written = cli(target, ['--output', target.output, '--write']);
    assert.equal(written.status, 0, written.stderr);
    const result = JSON.parse(written.stdout);
    assert.deepEqual(result.integrity, JSON.parse(preview.stdout).integrity);
    assert.deepEqual(JSON.parse(readFileSync(result.summary)), result.integrity);
    assert.equal(result.integrity.submission, 'not_submitted');
    assert.equal(result.integrity.approval, 'unverified');
    assert.notEqual(cli(target, ['--output', target.output, '--write']).status, 0);
    assert.notEqual(cli(target, ['--output', target.output, '--publish']).status, 0);
});
