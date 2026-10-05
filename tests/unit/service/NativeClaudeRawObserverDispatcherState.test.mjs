// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { NativeClaudeRawArtifactRepository } from '../../../src/repository/NativeClaudeRawArtifactRepository.ts';
import { NativeClaudeRawObserverDispatcher } from '../../../src/service/NativeClaudeRawObserverDispatcher.ts';
import { NativePilotStateSnapshotRepository } from '../../../src/repository/NativePilotStateSnapshotRepository.ts';

const uuid = 'b0b3693a-f914-4286-a5da-9fe48e6a72bb';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture(t, options = {}) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-state-fixture-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = join(root, 'home');
    const output = join(root, 'output');
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(output, { mode: 0o700 });
    const state = new NativePilotStateSnapshotRepository({ home, outputRoot: output });
    if (!options.absent) state.seed(uuid); // Explicit synthetic baseline, never an observer action.
    const mutate = (sql) => {
        const database = new DatabaseSync(state.databasePath);
        try {
            database.exec(sql);
        } finally {
            database.close();
        }
    };
    if (options.unsupported) mutate('ALTER TABLE usage_reads ADD COLUMN unknown_value TEXT');
    let clock = 0;
    let factoryCalls = 0;
    const events = [];
    const requests = [];
    class Files extends NativeClaudeRawArtifactRepository {
        absent() {}
        create() {
            return output;
        }
        read(path, limit) {
            if (path.startsWith('/pilot/native-output/'))
                return Buffer.from('synthetic diagnostic');
            return super.read(path, limit);
        }
    }
    const transport = {
        async context(selection) {
            return {
                schema_version: 1,
                mode: 'synthetic',
                observer_pid: 42,
                account: { home },
                selection,
                contract: {
                    mcp: {
                        claude: { a: 'plugin:i9-skills:skills', b: 'plugin:i9-skills:updated' },
                    },
                },
            };
        },
        async run(command) {
            events.push(command.label);
            requests.push(command);
            if (options.mutateHealth && command.label === 'mcp-get')
                mutate("UPDATE usage_reads SET skill='changed-by-synthetic-health-call'");
            if (options.initWriter && command.label === 'init-only')
                mutate("UPDATE usage_reads SET skill='changed-by-synthetic-init-writer'");
            return {
                status: 'completed',
                exit_code:
                    command.label === options.fail ? 2 : command.label.startsWith('auth-') ? 1 : 0,
                signal: null,
                pid: 100 + requests.length,
                start_ticks: String(requests.length),
                cleanup: 'group-absent',
                stdout: Buffer.from('synthetic raw stdout'),
                stderr: Buffer.alloc(0),
            };
        },
        async snapshot() {
            events.push('source-snapshot');
            if (options.sourceSnapshotClock !== undefined) clock = options.sourceSnapshotClock;
            return null;
        },
        async recheck() {
            return true;
        },
    };
    const observer = new NativeClaudeRawObserverDispatcher(
        transport,
        new Files(),
        () => clock,
        (selectedHome, selectedOutput) => {
            factoryCalls++;
            assert.equal(selectedHome, home);
            assert.equal(selectedOutput, output);
            return {
                snapshot(label) {
                    events.push(label);
                    if (options.throwSnapshot === label)
                        throw new Error('synthetic snapshot failure');
                    const value = state.snapshot(label);
                    if (options.snapshotClock?.[label] !== undefined)
                        clock = options.snapshotClock[label];
                    return value;
                },
                artifacts: (label) => state.artifacts(label),
                readOnlyPreservation: (before, after) => state.readOnlyPreservation(before, after),
                seed() {
                    assert.fail('The observation must never seed or migrate a source database.');
                },
            };
        },
    );
    const run = async (phase = 'observe-a') => {
        const result = await observer.run([
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
            phase,
            '--pin',
            phase === 'observe-b' ? 'b' : 'a',
        ]);
        return {
            result,
            report: JSON.parse(readFileSync(join(output, 'observation.json'))),
            stateReport: JSON.parse(readFileSync(join(output, 'mcp-state.json'))),
        };
    };
    return { root, home, output, state, run, events, requests, factoryCalls: () => factoryCalls };
}

for (const phase of ['observe-a', 'observe-b', 'observe-restored-a']) {
    test(`${phase}: actual fixture database bytes bracket only health reads before the init writer`, async (t) => {
        const f = fixture(t, { initWriter: true });
        const { result, report, stateReport } = await f.run(phase);
        assert.equal(result.status, 'captured');
        assert.equal(result.native_acceptance, false);
        assert.equal(report.semantic_checks.status, 'blocked'); // Fake native bytes are never semantic proof.
        assert.equal(stateReport.status, 'captured');
        assert.equal(stateReport.preservation, 'existing_unchanged');
        assert.ok(!report.unmeasured.includes('read-only-mcp-state-preservation'));
        assert.ok(report.unmeasured.includes('native-mcp-catalog-and-resource-calls'));
        assert.deepEqual(f.events, [
            'version',
            'auth-before',
            'plugins',
            'mcp-before',
            'mcp-list',
            'mcp-get',
            'mcp-after',
            'source-snapshot',
            'init-only',
            'source-snapshot',
            'auth-after',
        ]);
        const before = JSON.parse(readFileSync(join(f.output, 'mcp-before-state.json')));
        const after = JSON.parse(readFileSync(join(f.output, 'mcp-after-state.json')));
        assert.equal(before.status, 'captured');
        assert.deepEqual(after, before);
        assert.notEqual(sha(readFileSync(f.state.databasePath)), before.files[0].sha256);
        assert.equal(f.factoryCalls(), 1);
        for (const receipt of result.evidence) {
            const bytes = readFileSync(join(f.output, receipt.path));
            assert.equal(sha(bytes), receipt.sha256);
            assert.equal(bytes.length, receipt.bytes);
        }
        assert.deepEqual(
            stateReport.snapshots.map((s) => s.role),
            ['state-before-mcp', 'state-bytes', 'state-after-mcp', 'state-bytes'],
        );
        for (const receipt of stateReport.snapshots) {
            assert.ok(receipt.path.startsWith('output/mcp-'));
            const bytes = readFileSync(join(f.root, receipt.path));
            assert.equal(sha(bytes), receipt.sha256);
        }
    });
}

test('absent database stays absent across health reads without creation or seeding', async (t) => {
    const f = fixture(t, { absent: true });
    const { stateReport } = await f.run();
    assert.equal(stateReport.status, 'captured');
    assert.equal(stateReport.preservation, 'absence_preserved');
    assert.equal(existsSync(join(f.home, '.agents')), false);
    assert.deepEqual(
        stateReport.snapshots.map((s) => s.role),
        ['state-before-mcp', 'state-after-mcp'],
    );
});

test('actual WAL and SHM bytes are retained unchanged on both sides of the health bracket', async (t) => {
    const f = fixture(t);
    const writer = new DatabaseSync(f.state.databasePath);
    try {
        writer.exec("PRAGMA journal_mode=WAL; UPDATE usage_reads SET skill='synthetic-wal-row'");
        const { stateReport } = await f.run();
        assert.equal(stateReport.preservation, 'existing_unchanged');
        const before = JSON.parse(readFileSync(join(f.output, 'mcp-before-state.json')));
        const after = JSON.parse(readFileSync(join(f.output, 'mcp-after-state.json')));
        assert.deepEqual(before, after);
        assert.deepEqual(
            before.files.map((f) => f.name),
            ['skills-usage.db', 'skills-usage.db-wal', 'skills-usage.db-shm'],
        );
        for (const file of before.files) {
            const source = readFileSync(join(f.home, '.agents', file.name));
            for (const label of ['mcp-before', 'mcp-after']) {
                const raw = readFileSync(join(f.output, `${label}-sqlite-copy`, file.name));
                assert.deepEqual(raw, source);
                assert.equal(sha(raw), file.sha256);
            }
        }
        assert.equal(stateReport.snapshots.filter((s) => s.role === 'state-bytes').length, 6);
    } finally {
        writer.close();
    }
});

test('a successful fake health process that changes actual state bytes cannot establish preservation', async (t) => {
    const f = fixture(t, { mutateHealth: true });
    const { result, stateReport } = await f.run();
    assert.equal(result.status, 'captured');
    assert.equal(stateReport.status, 'blocked');
    assert.equal(stateReport.preservation, 'blocked');
    assert.equal(stateReport.reason, 'state-changed-or-schema-unsupported');
    const before = JSON.parse(readFileSync(join(f.output, 'mcp-before-state.json')));
    const after = JSON.parse(readFileSync(join(f.output, 'mcp-after-state.json')));
    assert.notEqual(before.state_sha256, after.state_sha256);
});

test('copied valid migration ledger with altered SQL remains blocked and is never reset', async (t) => {
    const f = fixture(t, { unsupported: true });
    const original = readFileSync(f.state.databasePath);
    const { stateReport } = await f.run();
    assert.equal(stateReport.status, 'blocked');
    assert.equal(stateReport.preservation, 'blocked');
    assert.deepEqual(readFileSync(f.state.databasePath), original);
    assert.equal(
        JSON.parse(readFileSync(join(f.output, 'mcp-before-state.json'))).status,
        'blocked',
    );
});

for (const label of ['mcp-list', 'mcp-get']) {
    test(`${label} nonzero retains a closing state snapshot but stops before init and blocks preservation`, async (t) => {
        const f = fixture(t, { fail: label });
        const { result, report, stateReport } = await f.run();
        assert.equal(result.status, 'failed');
        assert.equal(report.init_attempted, false);
        assert.equal(stateReport.preservation, 'blocked');
        assert.equal(stateReport.reason, 'health-read-call-incomplete-or-nonzero');
        assert.ok(f.events.includes('mcp-after'));
        assert.ok(!f.events.includes('init-only'));
        assert.ok(existsSync(join(f.output, 'mcp-after-state.json')));
        if (label === 'mcp-list') assert.ok(!f.events.includes('mcp-get'));
    });
}

for (const label of ['mcp-before', 'mcp-after']) {
    test(`${label} snapshot failure retains raw receipts and cannot proceed to init`, async (t) => {
        const f = fixture(t, { throwSnapshot: label });
        const { result, report, stateReport } = await f.run();
        assert.equal(result.status, 'blocked');
        assert.equal(stateReport.status, 'blocked');
        assert.equal(report.init_attempted, false);
        assert.ok(!f.events.includes('init-only'));
        if (label === 'mcp-before') assert.ok(!f.events.includes('mcp-list'));
        else assert.ok(existsSync(join(f.output, '05-mcp-get-process.json')));
    });
}

test('state-before snapshot exhausting the shared phase budget prevents any MCP child', async (t) => {
    const f = fixture(t, { snapshotClock: { 'mcp-before': 40_001 } });
    const { result, stateReport } = await f.run();
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'raw_phase_budget');
    assert.equal(stateReport.preservation, 'blocked');
    assert.ok(!f.events.includes('mcp-list'));
    assert.ok(!existsSync(join(f.output, '04-mcp-list-request.json')));
    assert.ok(existsSync(join(f.output, 'mcp-before-state.json')));
    assert.ok(existsSync(join(f.output, 'mcp-after-state.json')));
});

test('awaited source snapshot exhausting phase budget prevents init dispatch and retains its bytes', async (t) => {
    const f = fixture(t, { sourceSnapshotClock: 40_001 });
    const { result, report } = await f.run();
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'raw_phase_budget');
    assert.equal(report.init_attempted, false);
    assert.ok(!f.events.includes('init-only'));
    assert.ok(existsSync(join(f.output, 'source-before.json')));
    assert.ok(!existsSync(join(f.output, '06-init-only-request.json')));
});

test('retained native request uses only actual remaining budget after source snapshot', async (t) => {
    const f = fixture(t, { sourceSnapshotClock: 39_000 });
    await f.run();
    const request = JSON.parse(readFileSync(join(f.output, '06-init-only-request.json')));
    assert.equal(request.timeout_ms, 1_000);
    assert.equal(f.requests.find((r) => r.label === 'init-only').timeout_ms, 1_000);
});

test('state-after snapshot exhausting budget prevents source snapshot and init dispatch', async (t) => {
    const f = fixture(t, { snapshotClock: { 'mcp-after': 40_001 } });
    const { result } = await f.run();
    assert.equal(result.reason, 'raw_phase_budget');
    assert.ok(!f.events.includes('source-snapshot'));
    assert.ok(!f.events.includes('init-only'));
});

for (const phase of ['baseline', 'verify-absent']) {
    test(`${phase} retains no-init absence recipe and does not request state snapshots`, async (t) => {
        const f = fixture(t);
        const { stateReport } = await f.run(phase);
        assert.equal(stateReport.status, 'not-run');
        assert.equal(stateReport.preservation, null);
        assert.deepEqual(stateReport.snapshots, []);
        assert.equal(f.factoryCalls(), 0);
        assert.ok(!f.events.includes('init-only'));
    });
}
