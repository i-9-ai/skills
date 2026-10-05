// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
    linkSync,
    realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { NativeClaudeRawConfiguration } from '../../../src/config/NativeClaudeRawConfiguration.ts';
import { NativeClaudeRawArtifactRepository } from '../../../src/repository/NativeClaudeRawArtifactRepository.ts';
import { NativeClaudeRawObserverDispatcher } from '../../../src/service/NativeClaudeRawObserverDispatcher.ts';

const uuid = 'b0b3693a-f914-4286-a5da-9fe48e6a72bb';
const argv = [
    '--contract',
    '/pilot/contract.json',
    '--root',
    '/pilot',
    '--run-id',
    uuid,
    '--host',
    'claude',
    '--repetition',
    '1',
    '--phase',
    'observe-a',
    '--pin',
    'a',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture(t, options = {}) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-raw-claude-fake-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    let output = null;
    const seen = [];
    class Files extends NativeClaudeRawArtifactRepository {
        absent() {
            if (options.preexisting) throw new Error('raw_diagnostic_preexisting');
        }
        create(_parent, name) {
            output = super.create(root, name);
            return output;
        }
        read(path, limit) {
            if (path.startsWith('/pilot/native-output/')) {
                if (options.missingDiagnostic) {
                    const error = new Error('missing');
                    error.code = 'ENOENT';
                    throw error;
                }
                if (options.badDiagnostic) throw new Error('raw_file');
                return Buffer.from('unreviewed native diagnostic\n');
            }
            return super.read(path, limit);
        }
    }
    const transport = {
        async context(selection) {
            return {
                schema_version: 1,
                mode: 'synthetic',
                observer_pid: 42,
                account: { home: join('/', 'home', 'node') },
                selection,
                contract: {
                    mcp: {
                        claude: { a: 'plugin:i9-skills:skills', b: 'plugin:i9-skills:updated' },
                    },
                },
                environment: [
                    'HOME=' + join('/', 'home', 'node'),
                    'HOSTNAME=fixture',
                    'NODE_VERSION=24.21.0',
                    'YARN_VERSION=1.22.22',
                ],
            };
        },
        async run(request) {
            seen.push(request);
            return {
                status: 'completed',
                exit_code:
                    request.label.startsWith('auth-') ||
                    (options.absence && request.label === 'mcp-get')
                        ? 1
                        : 0,
                signal: null,
                pid: 42,
                start_ticks: '123',
                stdout: Buffer.from([0xff, 0x00, 0x0a]),
                stderr: Buffer.from('fixture stderr\n'),
                cleanup: 'group-absent',
                ...(options.results?.[request.label] ?? {}),
            };
        },
        async snapshot() {
            return null;
        },
        async recheck() {
            return options.changed !== true;
        },
    };
    let clock = 0;
    const observer = new NativeClaudeRawObserverDispatcher(
        transport,
        new Files(),
        () => {
            if (options.budget && clock++ > 0) return 40_001;
            return 0;
        },
        () => ({
            snapshot(label) {
                const snapshot = {
                    schema_version: 2,
                    exists: false,
                    files: [],
                    migrations: [],
                    schema: [],
                    tables: [],
                    state_sha256: sha('absent'),
                    status: 'captured',
                    reason: 'synthetic-absent',
                };
                writeFileSync(join(output, `${label}-state.json`), JSON.stringify(snapshot));
                return snapshot;
            },
            artifacts(label) {
                const path = `${label}-state.json`;
                const content = readFileSync(join(output, path));
                return [{ path, bytes: content.length, sha256: sha(content) }];
            },
            readOnlyPreservation() {
                return 'absence_preserved';
            },
        }),
    );
    return { observer, root, seen, output: () => output };
}

test('fixed phase and pin combinations reject mismatches', () => {
    const config = new NativeClaudeRawConfiguration();
    assert.equal(config.selection(argv).phase, 'observe-a');
    for (const [index, value] of [
        [9, '2.0'],
        [11, 'observe-b'],
        [7, 'codex'],
        [13, 'b'],
        [1, '/tmp/request.json'],
    ]) {
        const invalid = [...argv];
        invalid[index] = value;
        assert.throws(() => config.selection(invalid));
    }
    assert.throws(() => config.selection([...argv, '--shell', 'anything']));
    assert.throws(() => config.commands('arbitrary', '/pilot/native-output/diagnostic.log'));
});

test('fixed recipe contains only seven no-conversation calls and no stdin', () => {
    const config = new NativeClaudeRawConfiguration();
    const calls = config.commands(
        'plugin:i9-skills:skills',
        config.diagnostic(config.selection(argv)),
    );
    assert.deepEqual(
        calls.map((call) => call.argv),
        [
            ['--version'],
            ['auth', 'status'],
            ['plugin', 'list', '--json'],
            ['mcp', 'list'],
            ['mcp', 'get', 'plugin:i9-skills:skills'],
            [
                '--init-only',
                '--debug-file',
                `/pilot/native-output/${uuid}-1-observe-a.claude.debug.log`,
            ],
            ['auth', 'status'],
        ],
    );
    assert.ok(
        calls.every(
            (call) =>
                call.executable === '/pilot/runtime-bin/claude' &&
                call.cwd === '/pilot/consumer' &&
                call.stdin === null,
        ),
    );
});

for (const phase of ['observe-b', 'observe-restored-a']) {
    test(`fixed ${phase} uses its matching selected MCP pin and unique diagnostic path`, async (t) => {
        const f = fixture(t);
        const selected = [...argv];
        selected[11] = phase;
        selected[13] = phase === 'observe-b' ? 'b' : 'a';
        const result = await f.observer.run(selected);
        assert.equal(result.status, 'captured');
        assert.equal(result.native_acceptance, false);
        assert.equal(
            f.seen.find((c) => c.label === 'mcp-get').argv[2],
            phase === 'observe-b' ? 'plugin:i9-skills:updated' : 'plugin:i9-skills:skills',
        );
        assert.ok(
            f.seen
                .find((c) => c.label === 'init-only')
                .argv[2].endsWith(`-${phase}.claude.debug.log`),
        );
        assert.ok(readFileSync(join(f.output(), 'source-before.json')));
        assert.ok(readFileSync(join(f.output(), 'source-after.json')));
    });
}

for (const phase of ['baseline', 'verify-absent']) {
    test(`${phase} retains fixed absent-get status and never attempts init or a diagnostic reservation`, async (t) => {
        const f = fixture(t, { absence: true, preexisting: true });
        const selected = [...argv];
        selected[11] = phase;
        const result = await f.observer.run(selected);
        assert.equal(result.status, 'captured');
        assert.ok(f.seen.every((c) => c.label !== 'init-only'));
        assert.deepEqual(f.seen.find((c) => c.label === 'marketplaces').argv, [
            'plugin',
            'marketplace',
            'list',
            '--json',
        ]);
        assert.equal(
            JSON.parse(readFileSync(join(f.output(), 'observation.json'))).init_attempted,
            false,
        );
        assert.ok(!readdirSync(f.output()).some((p) => p.startsWith('source-')));
    });
}

test('retains exact invalid UTF-8 bytes without guessing native schemas or asserting auth absence', async (t) => {
    const f = fixture(t);
    const result = await f.observer.run(argv);
    assert.equal(result.status, 'captured');
    assert.equal(result.native_acceptance, false);
    assert.equal(f.seen.length, 7);
    assert.ok(
        readFileSync(join(f.output(), '01-version.stdout')).equals(Buffer.from([0xff, 0, 10])),
    );
    const report = JSON.parse(readFileSync(join(f.output(), 'observation.json')));
    assert.equal(report.semantic_checks.status, 'blocked');
    assert.equal(report.lifecycle_checks, 'not-run');
    assert.ok(report.unmeasured.includes('native-mcp-catalog-and-resource-calls'));
    assert.equal(report.diagnostic_status, 'retained');
    const context = JSON.parse(readFileSync(join(f.output(), 'context.json')));
    assert.ok(context.environment.includes('HOSTNAME=fixture'));
    for (const artifact of result.evidence) {
        const bytes = readFileSync(join(f.output(), artifact.path));
        assert.equal(artifact.sha256, sha(bytes));
        assert.equal(artifact.bytes, bytes.length);
    }
});

test('retains init-only nonzero diagnostic and stops subsequent auth call', async (t) => {
    const f = fixture(t, { results: { 'init-only': { exit_code: 3 } } });
    const result = await f.observer.run(argv);
    assert.equal(result.status, 'failed');
    assert.equal(f.seen.length, 6);
    assert.equal(
        readFileSync(join(f.output(), 'claude-diagnostic.log'), 'utf8'),
        'unreviewed native diagnostic\n',
    );
    assert.equal(
        JSON.parse(readFileSync(join(f.output(), '06-init-only-process.json'))).exit_code,
        3,
    );
});

test('earlier nonzero stops before any init-only call while preserving prior receipts', async (t) => {
    const f = fixture(t, { results: { plugins: { exit_code: 1 } } });
    const result = await f.observer.run(argv);
    assert.equal(result.status, 'failed');
    assert.deepEqual(
        f.seen.map((r) => r.label),
        ['version', 'auth-before', 'plugins'],
    );
    assert.equal(
        JSON.parse(readFileSync(join(f.output(), 'observation.json'))).init_attempted,
        false,
    );
});

for (const partial of [
    { status: 'timeout' },
    { status: 'output-limit' },
    { signal: 'SIGTERM' },
    { cleanup: 'unverified' },
]) {
    test(`stops after ${JSON.stringify(partial)} with retained bytes`, async (t) => {
        const f = fixture(t, { results: { version: partial } });
        assert.equal((await f.observer.run(argv)).status, 'failed');
        assert.equal(f.seen.length, 1);
        assert.ok(readFileSync(join(f.output(), '01-version.stdout')).length);
    });
}

test('changed selected inputs fail without rewriting retained raw capture', async (t) => {
    const f = fixture(t, { changed: true });
    const result = await f.observer.run(argv);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'raw_selected_inputs_changed');
    assert.equal(f.seen.length, 7);
});

test('shared budget bounds commands and returns a blocked raw report', async (t) => {
    const f = fixture(t, { budget: true });
    assert.equal((await f.observer.run(argv)).status, 'blocked');
    assert.equal(f.seen.length, 0);
});

test('preexisting diagnostic is rejected before new evidence root creation', async (t) => {
    const f = fixture(t, { preexisting: true });
    await assert.rejects(() => f.observer.run(argv), /raw_diagnostic_preexisting/);
    assert.equal(f.output(), null);
    assert.deepEqual(readdirSync(f.root), []);
    assert.equal(f.seen.length, 0);
});

test('missing or unsafe diagnostics do not turn raw completion into native acceptance', async (t) => {
    for (const options of [{ missingDiagnostic: true }, { badDiagnostic: true }]) {
        const f = fixture(t, options);
        const result = await f.observer.run(argv);
        assert.equal(result.native_acceptance, false);
        const report = JSON.parse(readFileSync(join(f.output(), 'observation.json')));
        assert.equal(report.diagnostic_status, options.missingDiagnostic ? 'absent' : 'blocked');
    }
});

test('ordinary artifact repository uses exclusive bytes and rejects links', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-raw-artifact-fake-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const files = new NativeClaudeRawArtifactRepository();
    const output = files.create(root, 'owned');
    const bytes = Buffer.from([0xff, 0, 0x80]);
    const receipt = files.retain(output, 'raw.log', bytes);
    assert.equal(receipt.sha256, sha(bytes));
    assert.throws(() => files.retain(output, 'raw.log', Buffer.from('replace')), /EEXIST/);
    assert.deepEqual(files.read(join(output, 'raw.log'), 3), bytes);
    assert.throws(() => files.read(join(output, 'raw.log'), 2), /raw_file/);
    symlinkSync(join(output, 'raw.log'), join(output, 'linked.log'));
    assert.throws(() => files.read(join(output, 'linked.log'), 3), /raw_file/);
    linkSync(join(output, 'raw.log'), join(output, 'alias.log'));
    assert.throws(() => files.read(join(output, 'alias.log'), 3), /raw_file/);
    const linked = join(root, 'linked');
    symlinkSync(output, linked);
    assert.throws(() => files.create(linked, 'child'), /raw_directory/);
});
