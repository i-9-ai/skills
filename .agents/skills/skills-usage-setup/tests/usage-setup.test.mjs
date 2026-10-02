// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setup, record, createObserverDescriptor, observeHost, jsonArrayMapProvider } from '../scripts/usage_setup.mjs';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(packageRoot, 'scripts', 'usage_setup.mjs');

function fixture(t, host = 'claude') {
    const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'skills-usage-fixture-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = join(root, 'settings.json');
    const collection = join(root, 'skills');
    fs.mkdirSync(join(collection, 'example-skill'), { recursive: true });
    fs.writeFileSync(join(collection, 'example-skill', 'SKILL.md'), '# Synthetic skill body\n');
    fs.writeFileSync(file, JSON.stringify({ theme: 'retain', hooks: { SkillRead: [{ command: 'existing' }] } }));
    const retained = join(root, 'observer', 'scripts', 'usage_setup.mjs');
    fs.mkdirSync(dirname(retained), { recursive: true });
    fs.copyFileSync(script, retained);
    fs.chmodSync(retained, 0o444);
    const registration = createObserverDescriptor({
        host, script: retained, collections: { example: collection }, store: join(root, 'reads.jsonl'),
    });
    const reviewedRegistrationDigest = setup({ action: 'enable', file, registration }).registration_digest;
    return { root, file, registration, reviewedRegistrationDigest };
}
function content(file) { return fs.readFileSync(file, 'utf8'); }
function metadata() {
    return { collection: 'example', skill: 'example-skill', kind: 'read_confirmed',
        session_key: 'a'.repeat(64), observed_at: '2026-10-01T22:00:00.000Z' };
}

test('preview and status create no state and preserve existing bytes', (t) => {
    const input = fixture(t);
    const before = content(input.file);
    const preview = setup({ ...input, action: 'enable' });
    assert.equal(preview.preview, true);
    assert.deepEqual(preview.observer_descriptor, input.registration);
    assert.match(preview.registration.events.PreToolUse[0].hooks[0].command, /observe-host/u);
    assert.equal(setup({ ...input, action: 'status' }).enabled, false);
    assert.equal(content(input.file), before);
    assert.deepEqual(fs.readdirSync(input.root).sort(), ['observer', 'settings.json', 'skills']);
});

test('enable requires the exact reviewed descriptor before creating state', (t) => {
    const input = fixture(t);
    const before = content(input.file);
    const preview = setup({ ...input, action: 'enable' });
    assert.match(preview.registration_digest, /^[a-f0-9]{64}$/u);
    assert.equal(preview.settings, input.file);
    assert.match(preview.effects, /automatically with user authority/u);
    for (const reviewedRegistrationDigest of [undefined, '0'.repeat(64), ['0'.repeat(64)]]) {
        assert.throws(() => setup({ ...input, action: 'enable', write: true, reviewedRegistrationDigest }), /exact reviewed/u);
        assert.equal(content(input.file), before);
        assert.equal(fs.existsSync(input.file + '.skills-usage.json'), false);
        assert.equal(fs.existsSync(input.file + '.skills-usage.lock'), false);
    }
    setup({ ...input, action: 'enable', write: true });
    assert.equal(setup({ ...input, action: 'status' }).enabled, true);
});

test('injected commands, unrelated runtime and stale retained bytes are rejected before writes', (t) => {
    const input = fixture(t);
    const before = content(input.file);
    for (const registration of [
        { ...input.registration, command: 'injected-shell-text' },
        { ...input.registration, arguments: ['--upload'] },
        { ...input.registration, runtime: { ...input.registration.runtime, executable: '/bin/sh' } },
        { ...input.registration, runtime: { ...input.registration.runtime, command: 'injected' } },
        { ...input.registration, host: 'unsupported' },
    ]) assert.throws(() => setup({ ...input, registration, action: 'enable', write: true }));
    fs.chmodSync(input.registration.runtime.script, 0o644);
    fs.appendFileSync(input.registration.runtime.script, '\n// Changed retained bytes.\n');
    fs.chmodSync(input.registration.runtime.script, 0o444);
    assert.throws(() => setup({ ...input, action: 'enable', write: true }), /runtime changed/u);
    assert.equal(content(input.file), before);
    assert.equal(fs.existsSync(input.file + '.skills-usage.json'), false);
});

test('mutable or linked retained runtime assets and unrelated script bytes are rejected', (t) => {
    const input = fixture(t);
    const retained = input.registration.runtime.script;
    fs.chmodSync(retained, 0o644);
    assert.throws(() => setup({ ...input, action: 'enable' }), /read-only/u);
    fs.chmodSync(retained, 0o444);
    const linked = join(input.root, 'linked.mjs');
    fs.symlinkSync(retained, linked);
    assert.throws(() => createObserverDescriptor({ ...input.registration, script: linked }), /without links/u);
    const other = join(input.root, 'unrelated.mjs');
    fs.writeFileSync(other, '// Unrelated local script.\n', { mode: 0o444 });
    assert.throws(() => createObserverDescriptor({ ...input.registration, script: other }), /bundled metadata observer/u);
    assert.equal(fs.existsSync(input.file + '.skills-usage.json'), false);
});

test('generic host command data remains manual preview only; legacy exact-owned removal is retained', (t) => {
    const input = fixture(t);
    const manual = setup({ ...input, action: 'enable' }).registration;
    manual.events = { SkillRead: [{ command: 'manual-untrusted-command' }] };
    const preview = setup({ ...input, registration: manual, action: 'enable' });
    assert.equal(preview.manual_only, true);
    assert.throws(() => setup({ ...input, registration: manual, action: 'enable', write: true }), /manual-only/u);
    // Synthetic legacy receipt, never run: exercises ownership-only cleanup.
    const settings = JSON.parse(content(input.file));
    settings.hooks.SkillRead.push(manual.events.SkillRead[0]);
    fs.writeFileSync(input.file, JSON.stringify(settings));
    const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
    fs.writeFileSync(input.file + '.skills-usage.json', JSON.stringify({
        schema_version: 1, owner: 'skills-usage-setup', settings: input.file,
        provider: 'json-array-map', active: true, registration: manual,
        registration_digest: createHash('sha256').update(canonical(manual)).digest('hex'),
    }));
    assert.equal(setup({ ...input, action: 'status' }).enabled, true);
    setup({ ...input, action: 'disable', write: true });
    assert.deepEqual(JSON.parse(content(input.file)).hooks.SkillRead, [{ command: 'existing' }]);
});

test('CLI writes accept the inspected closed descriptor only', (t) => {
    const input = fixture(t);
    const registrationFile = join(input.root, 'registration.json');
    fs.writeFileSync(registrationFile, JSON.stringify(input.registration));
    const args = [script, 'enable', '--file', input.file, '--registration', registrationFile];
    const preview = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(preview.status, 0, preview.stderr);
    const reviewed = JSON.parse(preview.stdout);
    const denied = spawnSync(process.execPath, [...args, '--write'], { encoding: 'utf8' });
    assert.equal(denied.status, 1);
    const allowed = spawnSync(process.execPath, [...args, '--write', '--reviewed-registration', reviewed.registration_digest], { encoding: 'utf8' });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(JSON.parse(allowed.stdout).written, true);
});

test('enable is idempotent and exact removal preserves unrelated settings and evidence', (t) => {
    const input = fixture(t);
    setup({ ...input, action: 'enable', write: true });
    const enabled = content(input.file);
    assert.equal(setup({ ...input, action: 'enable', write: true }).written, false);
    assert.equal(content(input.file), enabled);
    assert.equal(setup({ ...input, action: 'status' }).runtime_available, true);
    record({ store: input.registration.store, value: metadata(), write: true });
    const evidence = content(input.registration.store);
    setup({ ...input, action: 'disable', write: true });
    assert.deepEqual(JSON.parse(content(input.file)), { theme: 'retain', hooks: { SkillRead: [{ command: 'existing' }] } });
    assert.equal(content(input.registration.store), evidence);
    assert.equal(JSON.parse(content(input.file + '.skills-usage.json')).active, false);
});

test('active descriptor drift requires explicit reconfiguration instead of false idempotence', (t) => {
    const input = fixture(t);
    setup({ ...input, action: 'enable', write: true });
    const receiptFile = input.file + '.skills-usage.json';
    const receipt = JSON.parse(content(receiptFile));
    // Same generated commands, stale recorded identity: never mutate the actual Node runtime.
    receipt.observer_descriptor.runtime.executable_sha256 = '0'.repeat(64);
    fs.writeFileSync(receiptFile, JSON.stringify(receipt));
    const beforeSettings = content(input.file);
    const beforeReceipt = content(receiptFile);
    assert.equal(setup({ ...input, action: 'status' }).runtime_available, false);
    for (const write of [false, true]) {
        assert.throws(() => setup({ ...input, action: 'enable', write }), /reconcile or remove/u);
        assert.equal(content(input.file), beforeSettings);
        assert.equal(content(receiptFile), beforeReceipt);
    }
    setup({ ...input, action: 'disable', write: true });
    setup({ ...input, action: 'enable', write: true });
    assert.equal(setup({ ...input, action: 'status' }).runtime_available, true);
});

test('settings and evidence cannot live inside the retained observer package', (t) => {
    const input = fixture(t);
    const retainedRoot = dirname(dirname(input.registration.runtime.script));
    assert.throws(() => createObserverDescriptor({
        ...input.registration, script: input.registration.runtime.script,
        store: join(retainedRoot, 'reads.jsonl'),
    }), /outside the retained observer/u);
    const file = join(retainedRoot, 'settings.json');
    fs.writeFileSync(file, '{"retain":true}');
    for (const write of [false, true]) {
        assert.throws(() => setup({ ...input, file, action: 'enable', write }), /outside the retained observer/u);
        assert.equal(content(file), '{"retain":true}');
        assert.equal(fs.existsSync(file + '.skills-usage.json'), false);
    }
    assert.equal(fs.existsSync(join(retainedRoot, 'reads.jsonl')), false);
});

test('changed, duplicate and missing owned entries are refused', (t) => {
    for (const change of ['changed', 'duplicate', 'missing']) {
        const input = fixture(t);
        setup({ ...input, action: 'enable', write: true });
        const value = JSON.parse(content(input.file));
        if (change === 'changed') value.hooks.PreToolUse[0].hooks[0].command = 'operator-changed';
        if (change === 'duplicate') value.hooks.PreToolUse.push(value.hooks.PreToolUse[0]);
        if (change === 'missing') value.hooks.PreToolUse.pop();
        fs.writeFileSync(input.file, JSON.stringify(value));
        const before = content(input.file);
        assert.equal(setup({ ...input, action: 'status' }).registration_changed, true);
        assert.throws(() => setup({ ...input, action: 'disable', write: true }), /manual reconciliation/u);
        assert.equal(content(input.file), before);
    }
});

test('matching unowned entries, malformed JSON and unsafe paths do not mutate settings', (t) => {
    const input = fixture(t);
    const value = JSON.parse(content(input.file));
    value.hooks.PreToolUse = setup({ ...input, action: 'enable' }).registration.events.PreToolUse;
    fs.writeFileSync(input.file, JSON.stringify(value));
    assert.throws(() => setup({ ...input, action: 'enable', write: true }), /unowned/u);
    fs.writeFileSync(input.file, '{invalid');
    assert.throws(() => setup({ ...input, action: 'enable' }), /valid object/u);
    fs.unlinkSync(input.file);
    fs.writeFileSync(join(input.root, 'target.json'), '{}');
    fs.symlinkSync('target.json', input.file);
    assert.throws(() => setup({ ...input, action: 'status' }), /without links/u);
    fs.unlinkSync(input.file);
    fs.linkSync(join(input.root, 'target.json'), input.file);
    assert.throws(() => setup({ ...input, action: 'status' }), /without links/u);
});

test('runtime disappearance and changed code remain inspectable and exactly removable', (t) => {
    const input = fixture(t);
    setup({ ...input, action: 'enable', write: true });
    fs.rmSync(join(input.root, 'observer'), { recursive: true });
    assert.equal(setup({ ...input, action: 'status' }).runtime_available, false);
    fs.rmSync(join(input.root, 'skills'), { recursive: true });
    setup({ ...input, action: 'disable', write: true });
    assert.equal(setup({ ...input, action: 'status' }).enabled, false);
});

test('FIFO settings and stores are rejected without waiting for a writer', { skip: process.platform === 'win32' }, (t) => {
    const input = fixture(t);
    fs.unlinkSync(input.file);
    for (const file of [input.file, input.registration.store]) {
        const created = spawnSync('mkfifo', [file], { encoding: 'utf8', timeout: 1000 });
        assert.equal(created.status, 0);
    }
    const status = spawnSync(process.execPath, [script, 'status', '--file', input.file], { encoding: 'utf8', timeout: 1000 });
    assert.equal(status.error, undefined);
    assert.equal(status.status, 1);
    const observation = spawnSync(process.execPath, [script, 'observe', '--store', input.registration.store, '--write'],
        { encoding: 'utf8', input: JSON.stringify(metadata()), timeout: 1000 });
    assert.equal(observation.status, 0);
    assert.equal(observation.stdout, '');
    assert.equal(fs.existsSync(input.registration.store + '.lock'), false);
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

for (const host of ['claude', 'gemini', 'copilot']) {
    test(host + ': native read fixture retains metadata only and rejects missing success', (t) => {
        const input = fixture(t, host);
        const filename = join(input.registration.collections.example, 'example-skill', 'SKILL.md');
        const marker = ['private', 'synthetic', 'payload'].join('-');
        const events = host === 'copilot' ? ['preToolUse', 'postToolUse'] : host === 'gemini' ? ['BeforeTool', 'AfterTool'] : ['PreToolUse', 'PostToolUse'];
        setup({ ...input, action: 'enable', write: true });
        for (const event of events) {
            const value = host === 'copilot'
                ? { sessionId: 'synthetic-session', toolName: 'view', toolArgs: { path: filename }, toolResult: { resultType: 'success', textResultForLlm: marker }, prompt: marker }
                : { session_id: 'synthetic-session', hook_event_name: event, tool_name: host === 'gemini' ? 'read_file' : 'Read', tool_input: { file_path: filename }, tool_response: host === 'gemini' ? { llmContent: marker } : { content: marker }, prompt: marker };
            assert.equal(observeHost({ file: input.file, value, event }).recorded, true);
        }
        const bytes = content(input.registration.store);
        const records = bytes.trimEnd().split('\n').map(JSON.parse);
        assert.deepEqual(records.map((entry) => entry.kind), ['read_attempt', 'read_confirmed']);
        assert.ok(!bytes.includes(marker));
        assert.ok(!bytes.includes(filename));
        assert.ok(!bytes.includes('synthetic-session'));
        assert.ok(records.every((entry) => Object.keys(entry).length === 7));
        const missing = host === 'copilot'
            ? { sessionId: 'synthetic-session', toolName: 'view', toolArgs: { path: filename } }
            : { session_id: 'synthetic-session', hook_event_name: events[1], tool_name: host === 'gemini' ? 'read_file' : 'Read', tool_input: { file_path: filename } };
        assert.equal(observeHost({ file: input.file, value: missing, event: events[1] }).recorded, false);
        assert.equal(content(input.registration.store), bytes);
        assert.equal(setup({ ...input, action: 'status' }).runtime_available, true);
        setup({ ...input, action: 'disable', write: true });
        assert.equal(content(input.registration.store), bytes);
        assert.equal(observeHost({ file: input.file, value: missing, event: events[1] }).recorded, false);
    });
}

test('retained standalone observer executes only the selected synthetic read and emits neutral output', (t) => {
    const input = fixture(t);
    setup({ ...input, action: 'enable', write: true });
    const filename = join(input.registration.collections.example, 'example-skill', 'SKILL.md');
    const payload = { session_id: 'synthetic-session', hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: filename }, tool_response: { content: 'synthetic-only-body' } };
    const result = spawnSync(process.execPath, [input.registration.runtime.script, 'observe-host', '--file', input.file], { input: JSON.stringify(payload), encoding: 'utf8', cwd: input.root });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.equal(JSON.parse(content(input.registration.store)).kind, 'read_confirmed');
    assert.ok(!content(input.registration.store).includes('synthetic-only-body'));
});
