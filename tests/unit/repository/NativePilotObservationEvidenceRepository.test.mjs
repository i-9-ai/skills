// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
    NativePilotObservationEvidenceRepository,
    projectionDigest,
} from '../../../src/repository/NativePilotObservationEvidenceRepository.ts';

const selection = {
    run_id: 'b44ef2b9-5656-4e98-aa11-190937cb20cc',
    host: 'codex',
    repetition: 1,
};
const target = '/pilot/runtime-bin/codex';
const aliases = ['apply_patch', 'applypatch', 'codex-execve-wrapper', 'codex-linux-sandbox'];
const parent = '.codex/tmp/arg0/codex-arg0Ab1x9Z';
const alias = (name = aliases[0], value = target) => ({
    path: `${parent}/${name}`,
    kind: 'symlink',
    bytes: Buffer.byteLength(value),
    sha256: projectionDigest(value),
    target: value,
    base64: null,
});
function bundle(entries, rootName = 'home', host = 'codex') {
    return {
        schema_version: 1,
        operation: 'export',
        nonce: 'a'.repeat(32),
        selection: { ...selection, host },
        audit: {},
        roots: [
            ['home', join('/', 'home', 'node')],
            ['state', '/pilot/state'],
            ['work', '/pilot/work'],
            ['native-output', '/pilot/native-output'],
        ].map(([name, path]) => ({ name, path, entries: name === rootName ? entries : [] })),
    };
}
function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-export-alias-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return { root, repository: new NativePilotObservationEvidenceRepository(root) };
}

test('retains the four selected Codex runtime aliases as inert unchanged data', (t) => {
    const { root, repository } = fixture(t);
    const value = bundle(aliases.map((name) => alias(name)));
    const original = structuredClone(value);
    const parsed = repository.export(value, selection);
    assert.deepEqual([...parsed.roots.get('home').values()], value.roots[0].entries);
    assert.deepEqual(value, original);
    assert.deepEqual(readdirSync(root), []);
    assert(
        parsed.roots
            .get('home')
            .values()
            .every((entry) => entry.target === target),
    );
});

test('preserves the preexisting relative inert alias policy', (t) => {
    const { repository } = fixture(t);
    const entry = alias('relative-alias', '../../runtime-bin/codex');
    const parsed = repository.export(bundle([entry]), selection);
    assert.equal(parsed.roots.get('home').get(entry.path).target, entry.target);
});

for (const root of ['state', 'work', 'native-output']) {
    test(`rejects the same absolute Codex alias in the ${root} root`, (t) => {
        const { repository } = fixture(t);
        assert.throws(
            () => repository.export(bundle([alias()], root), selection),
            /projection_export_alias/,
        );
    });
}
test('rejects a Codex absolute alias for the Claude selection', (t) => {
    const { repository } = fixture(t);
    const value = bundle([alias()], 'home', 'claude');
    assert.throws(() => repository.export(value, value.selection), /projection_export_alias/);
});

for (const [name, value] of [
    ['different runtime', '/pilot/runtime-bin/claude'],
    ['system runtime', '/usr/bin/codex'],
    ['traversal', '/pilot/runtime-bin/../runtime-bin/codex'],
    ['dot segment', '/pilot/runtime-bin/./codex'],
    ['duplicate separator', '/pilot//runtime-bin/codex'],
    ['trailing separator', '/pilot/runtime-bin/codex/'],
    ['newline', '/pilot/runtime-bin/codex\n'],
    ['nul', '/pilot/runtime-bin/codex\0'],
    ['backslash', '/pilot/runtime-bin\\codex'],
]) {
    test(`rejects absolute target ${name} even with a matching byte hash`, (t) => {
        const { repository } = fixture(t);
        assert.throws(
            () => repository.export(bundle([alias(aliases[0], value)]), selection),
            /projection_export_alias/,
        );
    });
}
for (const [name, path] of [
    ['unrelated home path', '.codex/apply_patch'],
    ['wrong temporary root', '.codex/tmp/other/codex-arg0Ab1x9Z/apply_patch'],
    ['unrecognized name', `${parent}/node`],
    ['short suffix', '.codex/tmp/arg0/codex-arg0Ab1x9/apply_patch'],
    ['long suffix', '.codex/tmp/arg0/codex-arg0Ab1x9ZZ/apply_patch'],
    ['punctuated suffix', '.codex/tmp/arg0/codex-arg0Ab1x9-/apply_patch'],
    ['unicode suffix', '.codex/tmp/arg0/codex-arg0Ab1x9é/apply_patch'],
    ['extra descendant', `${parent}/apply_patch/child`],
    ['path traversal', `${parent}/../apply_patch`],
    ['absolute entry path', `/${parent}/apply_patch`],
    ['control character', `${parent}/apply_patch\n`],
]) {
    test(`rejects absolute alias with ${name}`, (t) => {
        const { repository } = fixture(t);
        assert.throws(
            () => repository.export(bundle([{ ...alias(), path }]), selection),
            /projection_export_(?:entry|alias)/,
        );
    });
}
for (const [name, change] of [
    ['wrong bytes', { bytes: 25 }],
    ['wrong digest', { sha256: '0'.repeat(64) }],
    ['non-null base64', { base64: '' }],
    ['non-string target', { target: null }],
]) {
    test(`rejects the selected alias with ${name}`, (t) => {
        const { repository } = fixture(t);
        assert.throws(
            () => repository.export(bundle([{ ...alias(), ...change }]), selection),
            /projection_export_alias/,
        );
    });
}

test('does not broaden ordinary file, duplicate-path or closed-field validation', (t) => {
    const { repository } = fixture(t);
    assert.throws(
        () => repository.export(bundle([{ ...alias(), kind: 'file' }]), selection),
        /projection_export_file/,
    );
    assert.throws(
        () => repository.export(bundle([alias(), alias()]), selection),
        /projection_export_entry/,
    );
    assert.throws(
        () => repository.export(bundle([{ ...alias(), executable: true }]), selection),
        /projection_closed_fields/,
    );
});
