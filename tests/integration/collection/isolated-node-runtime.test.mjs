// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {
    chmodSync,
    lstatSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IsolatedNodeRuntime } from '../../../.github/scripts/isolate-node-runtime.mjs';

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-ci-foundation-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = join(root, 'shared-node');
    writeFileSync(source, 'Synthetic executable foundation.\n', { mode: 0o775 });
    chmodSync(source, 0o775);
    return { root, source };
}

test('CI runtime isolation preserves shared bytes/mode and creates distinct private foundations', (t) => {
    const { root, source } = fixture(t);
    const runtime = new IsolatedNodeRuntime();
    const first = runtime.retain(root, source);
    const second = runtime.retain(root, source);
    assert.notEqual(first, second);
    assert.equal(lstatSync(source).mode & 0o777, 0o775);
    assert.equal(lstatSync(first).mode & 0o777, 0o700);
    assert.equal(lstatSync(join(first, 'node')).mode & 0o777, 0o755);
    assert.equal(lstatSync(join(first, 'node')).nlink, 1);
    assert.deepEqual(readFileSync(join(first, 'node')), readFileSync(source));
});

test('CI runtime isolation rejects a linked temporary root and non-file source', (t) => {
    const { root, source } = fixture(t);
    const alias = join(root, 'alias');
    symlinkSync(root, alias);
    const runtime = new IsolatedNodeRuntime();
    assert.throws(() => runtime.retain(alias, source), /canonical/);
    assert.throws(() => runtime.retain(root, root), /bounded existing/);
});
