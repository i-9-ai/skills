// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setup, record, jsonArrayMapProvider } from '../scripts/usage_setup.mjs';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(packageRoot, 'scripts', 'usage_setup.mjs');

function fixture(t) {
    const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'skills-usage-fixture-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = join(root, 'settings.json');
    const collection = join(root, 'skills');
    fs.mkdirSync(collection);
    fs.writeFileSync(
        file,
        JSON.stringify({
            theme: 'retain',
            hooks: { SkillRead: [{ command: 'existing' }] },
        }),
    );
    const registration = {
        provider: 'json-array-map',
        hook_path: ['hooks'],
        events: { SkillRead: [{ command: 'reviewed-synthetic-observer' }] },
        runtime_files: [process.execPath],
        collections: { example: collection },
        store: join(root, 'reads.jsonl'),
    };
    return { root, file, registration };
}
function content(file) {
    return fs.readFileSync(file, 'utf8');
}
function metadata() {
    return {
        collection: 'example',
        skill: 'example-skill',
        kind: 'read_confirmed',
        session_key: 'a'.repeat(64),
        observed_at: '2026-10-01T22:00:00.000Z',
    };
}

test('preview and status create no state and preserve existing bytes', (t) => {
    const input = fixture(t);
    const before = content(input.file);
    assert.equal(setup({ ...input, action: 'enable' }).preview, true);
    assert.equal(setup({ ...input, action: 'status' }).enabled, false);
    assert.equal(content(input.file), before);
    assert.deepEqual(fs.readdirSync(input.root).sort(), ['settings.json', 'skills']);
});

test('enable is idempotent and exact removal preserves unrelated hooks and evidence', (t) => {
    const input = fixture(t);
    setup({ ...input, action: 'enable', write: true });
    const enabled = content(input.file);
    assert.equal(setup({ ...input, action: 'enable', write: true }).written, false);
    assert.equal(content(input.file), enabled);
    assert.equal(setup({ ...input, action: 'status' }).runtime_available, true);
    record({ store: input.registration.store, value: metadata(), write: true });
    const evidence = content(input.registration.store);
    assert.equal(setup({ ...input, action: 'disable' }).preview, true);
    setup({ ...input, action: 'disable', write: true });
    assert.deepEqual(JSON.parse(content(input.file)), {
        theme: 'retain',
        hooks: { SkillRead: [{ command: 'existing' }] },
    });
    assert.equal(content(input.registration.store), evidence);
    assert.equal(JSON.parse(content(input.file + '.skills-usage.json')).active, false);
    assert.equal(setup({ ...input, action: 'status' }).enabled, false);
});

test('changed, duplicate and missing owned entries are refused', (t) => {
    for (const change of ['changed', 'duplicate', 'missing']) {
        const input = fixture(t);
        setup({ ...input, action: 'enable', write: true });
        const value = JSON.parse(content(input.file));
        if (change === 'changed') value.hooks.SkillRead[1].command = 'operator-changed';
        if (change === 'duplicate') value.hooks.SkillRead.push(value.hooks.SkillRead[1]);
        if (change === 'missing') value.hooks.SkillRead.pop();
        fs.writeFileSync(input.file, JSON.stringify(value));
        const before = content(input.file);
        assert.equal(setup({ ...input, action: 'status' }).registration_changed, true);
        assert.throws(
            () => setup({ ...input, action: 'disable', write: true }),
            /manual reconciliation/u,
        );
        assert.equal(content(input.file), before);
    }
});

test('matching unowned entries, malformed JSON and unsafe paths do not mutate settings', (t) => {
    const input = fixture(t);
    const value = JSON.parse(content(input.file));
    value.hooks.SkillRead.push(input.registration.events.SkillRead[0]);
    fs.writeFileSync(input.file, JSON.stringify(value));
    assert.throws(() => setup({ ...input, action: 'enable', write: true }), /unowned/u);
    fs.writeFileSync(input.file, '{invalid');
    assert.throws(() => setup({ ...input, action: 'enable', write: true }), /valid object/u);
    fs.unlinkSync(input.file);
    fs.writeFileSync(join(input.root, 'target.json'), '{}');
    fs.symlinkSync('target.json', input.file);
    assert.throws(() => setup({ ...input, action: 'status' }), /without links/u);
    fs.unlinkSync(input.file);
    fs.linkSync(join(input.root, 'target.json'), input.file);
    assert.throws(() => setup({ ...input, action: 'status' }), /without links/u);
    assert.throws(() => setup({ ...input, file: 'relative.json', action: 'status' }), /absolute/u);
});

test('runtime disappearance does not prevent inspection or owned removal', (t) => {
    const input = fixture(t);
    const runtime = join(input.root, 'runtime');
    fs.mkdirSync(runtime);
    fs.writeFileSync(join(runtime, 'observer.mjs'), '// synthetic runtime');
    input.registration.runtime_files = [join(runtime, 'observer.mjs')];
    setup({ ...input, action: 'enable', write: true });
    fs.rmSync(runtime, { recursive: true });
    assert.equal(setup({ ...input, action: 'status' }).runtime_available, false);
    fs.rmSync(join(input.root, 'skills'), { recursive: true });
    setup({ ...input, action: 'disable', write: true });
    assert.equal(setup({ ...input, action: 'status' }).enabled, false);
});

test(
    'FIFO settings and observation stores are rejected without waiting for a writer',
    { skip: process.platform === 'win32' },
    (t) => {
        const input = fixture(t);
        fs.unlinkSync(input.file);
        for (const file of [input.file, input.registration.store]) {
            const created = spawnSync('mkfifo', [file], { encoding: 'utf8', timeout: 1000 });
            assert.equal(created.status, 0, 'POSIX fixture requires mkfifo.');
        }
        const status = spawnSync(process.execPath, [script, 'status', '--file', input.file], {
            encoding: 'utf8',
            timeout: 1000,
        });
        assert.equal(status.error, undefined);
        assert.equal(status.status, 1);
        assert.equal(status.stdout, '');
        const observation = spawnSync(
            process.execPath,
            [script, 'observe', '--store', input.registration.store, '--write'],
            { encoding: 'utf8', input: JSON.stringify(metadata()), timeout: 1000 },
        );
        assert.equal(observation.error, undefined);
        assert.equal(observation.status, 0);
        assert.equal(observation.stdout, '');
        assert.equal(fs.lstatSync(input.registration.store).isFIFO(), true);
        assert.equal(fs.existsSync(input.registration.store + '.lock'), false);
    },
);

test('receipt write conflicts restore settings without deleting the other writer', (t) => {
    const input = fixture(t);
    const before = content(input.file);
    const provider = {
        ...jsonArrayMapProvider,
        merge(value, registration) {
            fs.writeFileSync(
                input.file + '.skills-usage.json',
                JSON.stringify({ another: 'writer' }),
            );
            return jsonArrayMapProvider.merge(value, registration);
        },
    };
    assert.throws(() => setup({ ...input, action: 'enable', write: true, provider }), /changed/u);
    assert.equal(content(input.file), before);
    assert.deepEqual(JSON.parse(content(input.file + '.skills-usage.json')), {
        another: 'writer',
    });
});

test('prototype paths, in-collection state and missing runtime are rejected', (t) => {
    const input = fixture(t);
    for (const registration of [
        { ...input.registration, hook_path: ['constructor'] },
        { ...input.registration, hook_path: [['hooks']] },
        {
            ...input.registration,
            store: join(input.registration.collections.example, 'store.jsonl'),
        },
        { ...input.registration, store: input.file + '.skills-usage.json' },
        { ...input.registration, store: input.file + '.skills-usage.lock' },
        { ...input.registration, store: input.file + '.skills-usage' },
        { ...input.registration, runtime_files: [join(input.root, 'missing')] },
    ])
        assert.throws(() => setup({ ...input, registration, action: 'enable', write: true }));
    assert.equal(Object.prototype.polluted, undefined);
});

test('observation stores reject file and ancestor links without modifying their targets', (t) => {
    const input = fixture(t);
    const target = join(input.root, 'target.jsonl');
    fs.writeFileSync(target, 'retain-evidence\n');
    fs.symlinkSync(target, input.registration.store);
    assert.throws(() =>
        record({ store: input.registration.store, value: metadata(), write: true }),
    );
    fs.unlinkSync(input.registration.store);
    fs.linkSync(target, input.registration.store);
    assert.throws(() =>
        record({ store: input.registration.store, value: metadata(), write: true }),
    );
    fs.unlinkSync(input.registration.store);
    fs.symlinkSync(input.root, join(input.root, 'linked-parent'));
    assert.throws(() =>
        record({
            store: join(input.root, 'linked-parent', 'new.jsonl'),
            value: metadata(),
            write: true,
        }),
    );
    assert.equal(content(target), 'retain-evidence\n');
    assert.equal(fs.existsSync(join(input.root, 'new.jsonl')), false);
    assert.throws(
        () =>
            record({
                store: join(packageRoot, 'synthetic-do-not-create.jsonl'),
                value: metadata(),
                write: true,
            }),
        /installed package/u,
    );
});

test('a valid observation store without final LF retains its old record and separates the append', (t) => {
    const input = fixture(t);
    const original = JSON.stringify({ schema_version: 1, retained: 'synthetic-prior-record' });
    fs.writeFileSync(input.registration.store, original);
    assert.equal(
        record({ store: input.registration.store, value: metadata(), write: true }).recorded,
        true,
    );
    const bytes = content(input.registration.store);
    assert.ok(bytes.startsWith(original + '\n'));
    const lines = bytes.trimEnd().split('\n');
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), JSON.parse(original));
    assert.equal(JSON.parse(lines[1]).kind, 'read_confirmed');
    assert.equal(JSON.parse(lines[1]).schema_version, 1);
    const nextBytes = Buffer.byteLength(
        JSON.stringify(record({ store: input.registration.store, value: metadata() }).event) + '\n',
    );
    const emptyBytes = Buffer.byteLength(JSON.stringify({ retained: '' }));
    const atLimitWithoutSeparator = JSON.stringify({
        retained: 'x'.repeat(4 * 1024 * 1024 - nextBytes - emptyBytes),
    });
    fs.writeFileSync(input.registration.store, atLimitWithoutSeparator);
    assert.throws(
        () => record({ store: input.registration.store, value: metadata(), write: true }),
        /full/u,
    );
    assert.equal(content(input.registration.store), atLimitWithoutSeparator);
});

test('metadata-only sink previews, rejects payload fields, and retains bounded records', (t) => {
    const input = fixture(t);
    assert.equal(record({ store: input.registration.store, value: metadata() }).preview, true);
    assert.equal(fs.existsSync(input.registration.store), false);
    for (const field of ['prompt', 'content', 'command', 'credentials']) {
        assert.throws(
            () =>
                record({
                    store: input.registration.store,
                    value: { ...metadata(), [field]: 'synthetic-private-marker' },
                    write: true,
                }),
            /five documented/u,
        );
    }
    for (const session_key of [['a'.repeat(64)], 123, { key: 'a'.repeat(64) }]) {
        assert.throws(
            () =>
                record({
                    store: input.registration.store,
                    value: { ...metadata(), session_key },
                    write: true,
                }),
            /identity/u,
        );
    }
    record({ store: input.registration.store, value: metadata(), write: true });
    const value = JSON.parse(content(input.registration.store));
    assert.deepEqual(Object.keys(value).sort(), [
        'collection',
        'event_id',
        'kind',
        'observed_at',
        'schema_version',
        'session_key',
        'skill',
    ]);
    fs.writeFileSync(input.registration.store, 'x'.repeat(4 * 1024 * 1024));
    assert.throws(
        () =>
            record({
                store: input.registration.store,
                value: metadata(),
                write: true,
            }),
        /full/u,
    );
    assert.equal(fs.statSync(input.registration.store).size, 4 * 1024 * 1024);
});

test('occupied locks are retained and observation failures are nonblocking without input echo', (t) => {
    const input = fixture(t);
    fs.writeFileSync(input.registration.store + '.lock', 'retained-lock');
    const result = spawnSync(
        process.execPath,
        [script, 'observe', '--store', input.registration.store, '--write'],
        {
            input: JSON.stringify(metadata()),
            encoding: 'utf8',
            cwd: input.root,
        },
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Operation failed/u);
    assert.equal(content(input.registration.store + '.lock'), 'retained-lock');
    const bad = spawnSync(
        process.execPath,
        [script, 'observe', '--store', input.registration.store],
        {
            input: JSON.stringify({
                ...metadata(),
                prompt: 'synthetic-private-marker',
            }),
            encoding: 'utf8',
        },
    );
    assert.equal(bad.status, 0);
    assert.ok(!bad.stderr.includes('synthetic-private-marker'));
});

test('detached package runs from unrelated cwd without repository dependencies', (t) => {
    const input = fixture(t);
    const installed = join(input.root, 'installed');
    fs.cpSync(packageRoot, installed, { recursive: true });
    const registrationFile = join(input.root, 'registration.json');
    fs.writeFileSync(registrationFile, JSON.stringify(input.registration));
    const result = spawnSync(
        process.execPath,
        [
            join(installed, 'scripts', 'usage_setup.mjs'),
            'enable',
            '--file',
            input.file,
            '--registration',
            registrationFile,
        ],
        { cwd: input.root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).preview, true);
    assert.equal(fs.existsSync(input.file + '.skills-usage.json'), false);
});
