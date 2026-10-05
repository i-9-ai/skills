// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, realpathSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    NativePilotObservationEvidenceRepository,
    projectionDigest,
} from '../../../src/repository/NativePilotObservationEvidenceRepository.ts';

const selection = { run_id: 'b44ef2b9-5656-4e98-aa11-190937cb20cc', host: 'claude', repetition: 1 };
const phases = ['observe-a', 'observe-b', 'observe-restored-a'];
function capturedFile(path) {
    const bytes = Buffer.from('Synthetic owned native debug data.\n');
    return {
        path,
        kind: 'file',
        bytes: bytes.length,
        sha256: projectionDigest(bytes),
        base64: bytes.toString('base64'),
        target: null,
    };
}
function fixture(t, phase = 'observe-a', repetition = 1) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-claude-export-alias-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const selected = { ...selection, repetition };
    const name = `${selected.run_id}-${selected.repetition}-${phase}.claude.debug.log`;
    const target = '/pilot/native-output/' + name;
    const alias = {
        path: 'latest',
        kind: 'symlink',
        bytes: Buffer.byteLength(target),
        sha256: projectionDigest(target),
        target,
        base64: null,
    };
    const file = capturedFile(name);
    const value = {
        schema_version: 1,
        operation: 'export',
        nonce: 'a'.repeat(32),
        selection: selected,
        audit: {},
        roots: ['home', 'state', 'work', 'native-output'].map((name) => ({
            name,
            path: name === 'home' ? join('/', 'home', 'node') : '/pilot/' + name,
            entries: name === 'native-output' ? [alias, file] : [],
        })),
    };
    return {
        root,
        selected,
        alias,
        file,
        value,
        repository: new NativePilotObservationEvidenceRepository(root),
        entries: value.roots[3].entries,
    };
}
function rehashAlias(alias, target) {
    Object.assign(alias, {
        target,
        bytes: Buffer.byteLength(target),
        sha256: projectionDigest(target),
    });
}

for (const phase of phases)
    for (const repetition of [1, 2])
        test(`retains selected Claude ${phase}/r${repetition} latest only as inert metadata with a captured ordinary target`, (t) => {
            const f = fixture(t, phase, repetition),
                original = structuredClone(f.value);
            const parsed = f.repository.export(f.value, f.selected);
            assert.deepEqual([...parsed.roots.get('native-output').values()], f.entries);
            assert.deepEqual(f.value, original);
            assert.deepEqual(readdirSync(f.root), []);
            f.entries.reverse();
            assert.equal(
                f.repository.export(f.value, f.selected).roots.get('native-output').get('latest')
                    .target,
                f.alias.target,
            );
        });

for (const [label, mutate] of [
    [
        'missing target',
        (f) => {
            f.entries.splice(1, 1);
        },
    ],
    [
        'directory target',
        (f) => {
            Object.assign(f.file, { kind: 'directory', bytes: 0, sha256: null, base64: null });
        },
    ],
    [
        'relative alias target instead of file',
        (f) => {
            Object.assign(f.file, {
                kind: 'symlink',
                target: 'unrelated',
                bytes: 9,
                sha256: projectionDigest('unrelated'),
                base64: null,
            });
        },
    ],
    [
        'bad target byte hash',
        (f) => {
            f.file.sha256 = '0'.repeat(64);
        },
    ],
    [
        'bad target byte size',
        (f) => {
            f.file.bytes++;
        },
    ],
    [
        'bad link hash',
        (f) => {
            f.alias.sha256 = '0'.repeat(64);
        },
    ],
    [
        'bad link byte size',
        (f) => {
            f.alias.bytes++;
        },
    ],
    [
        'unknown alias field',
        (f) => {
            f.alias.active = false;
        },
    ],
    [
        'unknown target field',
        (f) => {
            f.file.active = false;
        },
    ],
    [
        'non-null alias data',
        (f) => {
            f.alias.base64 = '';
        },
    ],
    [
        'duplicate target path',
        (f) => {
            f.entries.push({ ...f.file });
        },
    ],
    [
        'wrong link name',
        (f) => {
            f.alias.path = 'latest-debug';
        },
    ],
    [
        'wrong selected host',
        (f) => {
            f.selected.host = 'codex';
        },
    ],
    [
        'wrong selected run',
        (f) => {
            f.selected.run_id = 'd44ef2b9-5656-4e98-aa11-190937cb20cc';
        },
    ],
    [
        'wrong selected repetition',
        (f) => {
            f.selected.repetition = 2;
        },
    ],
    [
        'invalid selected repetition',
        (f) => {
            f.selected.repetition = 3;
        },
    ],
    [
        'invalid selected run',
        (f) => {
            f.selected.run_id = 'not-a-run';
        },
    ],
    [
        'wrong exported root',
        (f) => {
            f.value.roots[0].entries = f.entries;
            f.value.roots[3].entries = [];
        },
    ],
])
    test(`refuses Claude latest with ${label} without effects`, (t) => {
        const f = fixture(t);
        mutate(f);
        assert.throws(() => f.repository.export(f.value, f.selected));
        assert.deepEqual(readdirSync(f.root), []);
    });

for (const target of [
    '/pilot/native-output/other.claude.debug.log',
    `/pilot/native-output/${selection.run_id}-1-baseline.claude.debug.log`,
    `/pilot/native-output/${selection.run_id}-1-observe-other.claude.debug.log`,
    `/pilot/native-output/${selection.run_id}-1-observe-a.claude.debug.log/child`,
    `/pilot/native-output/../native-output/${selection.run_id}-1-observe-a.claude.debug.log`,
    `/pilot/native-output/./${selection.run_id}-1-observe-a.claude.debug.log`,
    `/pilot//native-output/${selection.run_id}-1-observe-a.claude.debug.log`,
    `/pilot/work/${selection.run_id}-1-observe-a.claude.debug.log`,
    '/pilot/runtime-bin/claude',
])
    test(`refuses rehashed nonselected absolute target ${target.split('/').at(-1)}`, (t) => {
        const f = fixture(t);
        rehashAlias(f.alias, target);
        assert.throws(() => f.repository.export(f.value, f.selected), /projection_export_alias/);
        assert.deepEqual(readdirSync(f.root), []);
    });

test('a prior selected phase latest can remain inert in a later checkpoint without proving that phase', (t) => {
    const f = fixture(t, 'observe-a');
    const parsed = f.repository.export(f.value, f.selected);
    assert.equal(parsed.roots.get('native-output').get('latest').target, f.alias.target);
    assert.equal(Object.hasOwn(parsed, 'native_acceptance'), false);
    assert.deepEqual(readdirSync(f.root), []);
});
