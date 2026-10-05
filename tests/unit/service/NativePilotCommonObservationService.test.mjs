// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    linkSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { join, posix } from 'node:path';
import { tmpdir } from 'node:os';
import {
    NativePilotObservationEvidenceRepository,
    projectionDigest,
} from '../../../src/repository/NativePilotObservationEvidenceRepository.ts';
import { NativePilotCommonObservationService } from '../../../src/service/NativePilotCommonObservationService.ts';
import { NativePilotCommonPhaseService } from '../../../src/service/NativePilotCommonPhaseService.ts';
import { NativePilotStateSnapshotRepository } from '../../../src/repository/NativePilotStateSnapshotRepository.ts';
const imageHome = posix.join('/', 'home', 'node');
const UUID = '8a7d0a7e-b672-478c-bb12-03a1a81d3e98';
const selection = { run_id: UUID, host: 'codex', repetition: 1 };
const nonce = 'a'.repeat(32);
const process = { status: 'completed', exit_code: 0, signal: null };
const absent = {
    schema_version: 2,
    exists: false,
    files: [],
    migrations: [],
    schema: [],
    tables: [],
    state_sha256: projectionDigest('absent'),
    status: 'captured',
    reason: 'source-state-absent-no-open-no-create',
};
const tree = { tree_sha256: projectionDigest('synthetic-source'), bytes: 0, entries: [] };
const contract = {
    binaries: {
        node: { version: '24.21.0', sha256: projectionDigest('node') },
        codex: { version: '0.160.0', sha256: projectionDigest('codex') },
        claude: { version: '2.1.285', sha256: projectionDigest('claude') },
    },
};
const prepared = {
    contract,
    trees: { source_a: tree, source_b: tree, driver: tree, observer: tree },
};
function fixture() {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'i9-common-projection-test-'));
    let index = 0;
    const receipt = (value, kind = 'process') => {
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        const path = `receipt-${++index}.json`;
        writeFileSync(join(root, path), bytes);
        return { path, bytes: bytes.length, sha256: projectionDigest(bytes), kind };
    };
    return { root, receipt, remove: () => rmSync(root, { recursive: true, force: true }) };
}
function exportedFile(path, bytes) {
    const data = Buffer.from(bytes);
    return {
        path,
        kind: 'file',
        bytes: data.length,
        sha256: projectionDigest(data),
        target: null,
        base64: data.toString('base64'),
    };
}
function bundle(entries = [], selected = selection, selectedNonce = nonce) {
    return {
        schema_version: 1,
        operation: 'export',
        nonce: selectedNonce,
        selection: selected,
        audit: {
            quiescent: true,
            status: 'quiescent',
            samples: [{}, {}],
            blocking_sockets: [],
            listeners: [],
        },
        roots: ['home', 'state', 'work', 'native-output'].map((name) => ({
            name,
            path: name === 'home' ? imageHome : `/pilot/${name}`,
            entries: name === 'native-output' ? entries : [],
        })),
    };
}
function preflight(f, selectedNonce = nonce, options = {}) {
    const checks = [
        'fresh-disposable-account',
        'normal-home-unchanged',
        'no-home-overrides',
        'no-credentials',
        'input-and-binary-pins-match',
        'exact-native-and-node-versions',
        'approved-native-schema',
        'measured-network-isolation',
        'measured-readonly-source-consumer-runtime',
        'measured-owned-writes',
        'measured-outside-write-denial',
        'privileged-sockets-inaccessible',
        'controller-and-native-permissions-separated',
    ];
    const step = {
        id: 'preflight',
        operation: 'observe',
        pin: null,
        commands: [{ executable: 'synthetic-fixed-worker', args: [], timeout_ms: 45_000 }],
        checks,
    };
    const probe = {
        schema_version: 1,
        operation: 'probe',
        nonce: selectedNonce,
        selection,
        uid: 1000,
        gid: 1000,
        passwd_name: 'node',
        passwd_home: imageHome,
        home: imageHome,
        environment: [
            `HOME=${imageHome}`,
            'PATH=/pilot/runtime-bin:/usr/bin:/bin',
            'LANG=C.UTF-8',
            'HOSTNAME=synthetic',
            'NODE_VERSION=24.21.0',
            'YARN_VERSION=1.22.22',
        ],
        credential_paths: [],
        hashes: {
            source_a: tree.tree_sha256,
            source_b: tree.tree_sha256,
            driver: tree.tree_sha256,
            observer: tree.tree_sha256,
            source: tree.tree_sha256,
            consumer: tree.tree_sha256,
            node: contract.binaries.node.sha256,
            codex: contract.binaries.codex.sha256,
            claude: contract.binaries.claude.sha256,
        },
        interfaces: ['lo'],
        routes: [],
        external_connect: 'ENETUNREACH',
        denied: [
            '/pilot/input',
            '/pilot/source',
            '/pilot/runtime-bin',
            '/pilot/consumer',
            '/pilot/control',
            '/var/tmp',
        ].map((path) => ({ path, error: 'EROFS' })),
        writable: [imageHome, '/pilot/state', '/pilot/work', '/pilot/native-output', '/tmp'].map(
            (path) => ({ path, created: true, removed: true }),
        ),
        sockets: [
            '/var/run/docker.sock',
            '/run/docker.sock',
            '/run/systemd/private',
            '/run/dbus/system_bus_socket',
        ].map((path) => ({ path, present: false })),
        no_new_privileges: 1,
        seccomp: 2,
        capabilities: {
            effective: '0000000000000000',
            permitted: '0000000000000000',
            bounding: '0000000000000000',
        },
        home_seed_sha256: projectionDigest('same normal image seed'),
    };
    const entries = [];
    const add = (path, value) => {
        const item = exportedFile(
            path,
            typeof value === 'string' ? value : JSON.stringify(value) + '\n',
        );
        entries.push(item);
        return { path, bytes: item.bytes, sha256: item.sha256 };
    };
    const calls = new NativePilotCommonPhaseService().calls(
        { ...selection, phase: step.id, pin: null },
        contract,
    );
    const processes = calls.map((call, i) => ({
        ...call,
        process,
        pid: 100 + i,
        start_ticks: null,
        stdout: add(`version-${i}.stdout`, i === 0 ? 'v24.21.0\n' : 'codex-cli 0.160.0\n'),
        stderr: add(`version-${i}.stderr`, ''),
        identity: add(`version-${i}-identity.json`, {
            schema_version: 1,
            status: 'unavailable',
            pid: 100 + i,
            start_ticks: null,
            executable: call.executable,
            stat: null,
        }),
    }));
    const snapshots = ['before', 'after'].flatMap((label) => [
        { role: 'state-observation', ...add(`${label}-state.json`, absent) },
        { role: 'source-inventory', ...add(`${label}-source.json`, tree) },
        { role: 'consumer-inventory', ...add(`${label}-consumer.json`, tree) },
    ]);
    const report = {
        schema_version: 2,
        kind: 'native-common-phase-evidence',
        selection,
        phase: 'preflight',
        pin: null,
        native_acceptance: false,
        context: {},
        processes,
        snapshots,
        result: 'observed',
        blocked_gate: null,
        unclaimed: [],
    };
    options.report?.(report, entries);
    const compact = {
        schema_version: 2,
        kind: 'native-common-phase-receipt',
        selection,
        phase: 'preflight',
        native_acceptance: false,
        report: add('phase.json', report),
    };
    const command = { process, stdout: JSON.stringify(compact) + '\n', stderr: '' };
    const facts = {
        schema_version: 1,
        phase: step.id,
        selection,
        native_acceptance: false,
        container_id: projectionDigest(selectedNonce),
        commands: [command],
        evidence: [
            f.receipt({ inspection: {}, probe }, 'confinement'),
            f.receipt(
                [
                    {
                        Name: `i9-pilot-${selectedNonce}-home`,
                        Labels: {
                            'i9.pilot.role': 'home',
                            'i9.pilot.nonce': selectedNonce,
                            'i9.pilot.run': UUID,
                            'i9.pilot.host': 'codex',
                            'i9.pilot.repetition': '1',
                        },
                    },
                ],
                'confinement',
            ),
            f.receipt({
                planned_command: step.commands[0],
                actual_command: {},
                observation: { operation: 'execute', phase: 'preflight', index: 0, ...command },
            }),
            f.receipt(bundle(entries, selection, selectedNonce), 'retention'),
        ],
    };
    return { step, facts };
}

function registration(f, phase = 'baseline', mutate = () => {}) {
    const step = {
        id: phase,
        operation: 'observe',
        pin: null,
        commands: [{ executable: 'synthetic-fixed-worker', args: [], timeout_ms: 45_000 }],
        checks: [
            'unauthenticated',
            'owned-plugin-and-marketplace-absent',
            'fresh-native-process',
            'owned-hooks-and-mcp-absent',
        ],
    };
    const entries = [];
    const add = (path, value) => {
        const item = exportedFile(
            path,
            typeof value === 'string' ? value : JSON.stringify(value) + '\n',
        );
        entries.push(item);
        return { path, bytes: item.bytes, sha256: item.sha256 };
    };
    const calls = new NativePilotCommonPhaseService().calls(
        { ...selection, phase, pin: null },
        contract,
    );
    const processes = calls.map((call, i) => {
        const pid = 100 + i;
        const start_ticks = String(8000 + i);
        const stat = Buffer.from(
            `${pid} (synthetic native) R ${Array.from({ length: 19 }, (_, n) => (n === 18 ? start_ticks : '0')).join(' ')}\n`,
        );
        return {
            ...call,
            pid,
            start_ticks,
            process: { ...process, exit_code: i === 0 ? 1 : 0 },
            stdout: add(
                `registry-${i}.stdout`,
                i === 0 ? '' : i === 1 ? '{"installed":[],"available":[]}' : '{"marketplaces":[]}',
            ),
            stderr: add(`registry-${i}.stderr`, i === 0 ? 'Not logged in\n' : ''),
            identity: add(`registry-${i}-identity.json`, {
                schema_version: 1,
                status: 'observed',
                pid,
                start_ticks,
                executable: call.executable,
                stat: {
                    bytes: stat.length,
                    sha256: projectionDigest(stat),
                    base64: stat.toString('base64'),
                },
            }),
        };
    });
    mutate(processes, entries, add);
    const report = {
        schema_version: 2,
        kind: 'native-common-phase-evidence',
        selection,
        phase,
        pin: null,
        native_acceptance: false,
        context: {},
        processes,
        snapshots: [],
        result: 'observed',
        blocked_gate: null,
        unclaimed: [],
    };
    const compact = {
        schema_version: 2,
        kind: 'native-common-phase-receipt',
        selection,
        phase,
        native_acceptance: false,
        report: add('phase.json', report),
    };
    const command = { process, stdout: JSON.stringify(compact) + '\n', stderr: '' };
    const facts = {
        schema_version: 1,
        phase,
        selection,
        native_acceptance: false,
        container_id: projectionDigest(nonce),
        commands: [command],
        evidence: [
            f.receipt({
                planned_command: step.commands[0],
                actual_command: {},
                observation: { operation: 'execute', phase, index: 0, ...command },
            }),
            f.receipt(bundle(entries), 'retention'),
        ],
    };
    return { step, facts };
}

test('verified child bytes and fixed native records establish only auth, registry and fresh-child gates', async () => {
    for (const phase of ['baseline', 'verify-absent']) {
        const f = fixture();
        try {
            const { step, facts } = registration(f, phase);
            const result = await new NativePilotCommonObservationService({
                prepared,
                evidenceRoot: f.root,
            }).project(step, selection, facts);
            assert.deepEqual(
                result.checks.map(({ satisfied }) => satisfied),
                [true, true, true, false],
            );
            assert.equal(result.loaded, null);
            assert.equal(result.rollback_state, null);
        } finally {
            f.remove();
        }
    }
});

test('advertised child identity must match the retained measured identity', async () => {
    const f = fixture();
    try {
        const { step, facts } = registration(f, 'baseline', (processes) => {
            processes[0].pid += 1;
        });
        await assert.rejects(
            new NativePilotCommonObservationService({ prepared, evidenceRoot: f.root }).project(
                step,
                selection,
                facts,
            ),
            /projection_native_child_identity/,
        );
    } finally {
        f.remove();
    }
});

test('unknown or unavailable measured identities never supply fresh-child proof', async () => {
    const f = fixture();
    try {
        const { step, facts } = registration(f, 'baseline', (processes, entries, add) => {
            processes[0].identity = add('unavailable-identity.json', {
                schema_version: 1,
                status: 'unavailable',
                pid: processes[0].pid,
                start_ticks: null,
                executable: processes[0].executable,
                stat: null,
            });
        });
        const result = await new NativePilotCommonObservationService({
            prepared,
            evidenceRoot: f.root,
        }).project(step, selection, facts);
        assert.deepEqual(
            result.checks.map(({ satisfied }) => satisfied),
            [true, true, false, false],
        );
    } finally {
        f.remove();
    }
});

test('unrecognized native registry output is retained and does not become absence', async () => {
    const f = fixture();
    try {
        const { step, facts } = registration(f, 'baseline', (processes, entries, add) => {
            processes[1].stdout = add('unknown-plugin.stdout', '{}');
        });
        const result = await new NativePilotCommonObservationService({
            prepared,
            evidenceRoot: f.root,
        }).project(step, selection, facts);
        assert.equal(result.checks[1].satisfied, false);
        assert.equal(result.checks[2].satisfied, true);
    } finally {
        f.remove();
    }
});
test('stable read verifies digest and rejects hardlinks/linked parents without importing code', () => {
    const f = fixture();
    try {
        const repo = new NativePilotObservationEvidenceRepository(f.root),
            r = f.receipt({ inert: true });
        assert.deepEqual(repo.json(r), { inert: true });
        assert.throws(() => repo.read({ ...r, sha256: '0'.repeat(64) }), /changed/);
        linkSync(join(f.root, r.path), join(f.root, 'alias.json'));
        assert.throws(() => repo.read(r), /ordinary_file/);
        mkdirSync(join(f.root, 'real'));
        writeFileSync(join(f.root, 'real', 'file'), 'x');
        symlinkSync('real', join(f.root, 'linked'));
        assert.throws(
            () => repo.read({ path: 'linked/file', bytes: 1, sha256: projectionDigest('x') }),
            /linked_parent/,
        );
        assert.throws(() => repo.read({ ...r, path: '../outside' }), /receipt/);
    } finally {
        f.remove();
    }
});
test('the full export reconciles even unused file bytes, duplicate locators and closed fields', () => {
    const f = fixture();
    try {
        const repo = new NativePilotObservationEvidenceRepository(f.root),
            value = bundle([exportedFile('unused.log', 'inert')]);
        repo.export(value, selection);
        value.roots[3].entries[0].base64 = Buffer.from('other').toString('base64');
        assert.throws(() => repo.export(value, selection), /file_hash/);
        value.roots[3].entries = [exportedFile('x', 'x'), exportedFile('x', 'x')];
        assert.throws(() => repo.export(value, selection), /export_entry/);
        value.roots[3].entries = [];
        value.extra = true;
        assert.throws(() => repo.export(value, selection), /closed_fields/);
    } finally {
        f.remove();
    }
});
test('projection retention hashes original bytes and cannot overwrite an existing locator', () => {
    const f = fixture();
    try {
        const repo = new NativePilotObservationEvidenceRepository(f.root),
            prefix = `${UUID}-codex-1-preflight`;
        const r = repo.retain(prefix, 1, Buffer.from([0, 255, 1]), 'native-log');
        assert.deepEqual(repo.read(r), Buffer.from([0, 255, 1]));
        assert.throws(
            () => repo.retain(prefix, 1, Buffer.from('overwrite'), 'native-log'),
            /EEXIST/,
        );
        assert.equal(r.sha256, projectionDigest(Buffer.from([0, 255, 1])));
    } finally {
        f.remove();
    }
});
test('actual-shape confinement, fixed version bytes and a unique home volume yield bounded preflight assertions', async () => {
    const f = fixture();
    try {
        const { step, facts } = preflight(f),
            service = new NativePilotCommonObservationService({ prepared, evidenceRoot: f.root });
        const result = await service.project(step, selection, facts);
        assert.ok(result.checks.every((check) => check.satisfied));
        assert.equal(result.loaded, null);
        assert.equal(result.rollback_state, null);
        for (const r of result.evidence)
            assert.equal(
                new NativePilotObservationEvidenceRepository(f.root).read(r).length,
                r.bytes,
            );
    } finally {
        f.remove();
    }
});
test('identical image seed bytes do not collapse two measured profile instances', async () => {
    const first = fixture(),
        second = fixture();
    try {
        const a = preflight(first, 'a'.repeat(32)),
            b = preflight(second, 'b'.repeat(32));
        const pa = await new NativePilotCommonObservationService({
            prepared,
            evidenceRoot: first.root,
        }).project(a.step, selection, a.facts);
        const pb = await new NativePilotCommonObservationService({
            prepared,
            evidenceRoot: second.root,
        }).project(b.step, selection, b.facts);
        assert.notEqual(pa.environment.profile_sha256, pb.environment.profile_sha256);
    } finally {
        first.remove();
        second.remove();
    }
});
test('unknown packet fields and altered fixed version argv are rejected while original inputs stay unchanged', async () => {
    for (const mutate of [
        (report) => {
            report.extra = true;
        },
        (report) => {
            report.processes[1].argv = ['exec', 'arbitrary'];
        },
    ]) {
        const f = fixture();
        try {
            const { step, facts } = preflight(f, nonce, { report: mutate });
            const before = facts.evidence.map((r) =>
                projectionDigest(readFileSync(join(f.root, r.path))),
            );
            await assert.rejects(
                new NativePilotCommonObservationService({ prepared, evidenceRoot: f.root }).project(
                    step,
                    selection,
                    facts,
                ),
            );
            assert.deepEqual(
                facts.evidence.map((r) => projectionDigest(readFileSync(join(f.root, r.path)))),
                before,
            );
        } finally {
            f.remove();
        }
    }
});
test('state raw bytes are decoded as SQLite bytes; complete schema/rows and bytes are required', async () => {
    const f = fixture();
    const stateRoot = mkdtempSync(join(realpathSync(tmpdir()), 'i9-native-state-fixture-'));
    try {
        const home = join(stateRoot, 'home'),
            out = join(stateRoot, 'output');
        mkdirSync(home);
        mkdirSync(out);
        const state = new NativePilotStateSnapshotRepository({ home, outputRoot: out });
        state.seed(UUID);
        const snapshot = state.snapshot('before');
        const { step, facts } = preflight(f, nonce, {
            report(report, entries) {
                report.snapshots = [];
                for (const file of state.artifacts('before')) {
                    const path = `state/${file.path}`,
                        entry = exportedFile(path, readFileSync(join(out, file.path)));
                    entries.push(entry);
                    report.snapshots.push({
                        role: file.path.endsWith('-state.json')
                            ? 'state-observation'
                            : 'state-bytes',
                        path,
                        bytes: entry.bytes,
                        sha256: entry.sha256,
                    });
                }
            },
        });
        const result = await new NativePilotCommonObservationService({
            prepared,
            evidenceRoot: f.root,
        }).project(step, selection, facts);
        assert.ok(snapshot.exists);
        assert.ok(result.evidence.some((r) => r.kind === 'state' && r.bytes > 8192));
    } finally {
        rmSync(stateRoot, { recursive: true, force: true });
        f.remove();
    }
});
test('runtime assertions are not manufactured from outer state snapshots or a filesystem artifact', async () => {
    const f = fixture();
    try {
        const step = {
            id: 'select-b',
            pin: 'b',
            operation: 'switch',
            commands: [],
            checks: [
                'owned-native-live-processes-absent',
                'active-source-matches-pin',
                'snapshots-preserved',
                'read-only-mcp-preserved-state',
                'fresh-native-process',
            ],
        };
        const facts = {
            schema_version: 1,
            phase: step.id,
            selection,
            native_acceptance: false,
            container_id: projectionDigest(nonce),
            commands: [],
            evidence: [
                f.receipt(
                    {
                        inspection: {},
                        probe: { operation: 'probe', hashes: { source: tree.tree_sha256 } },
                    },
                    'confinement',
                ),
                f.receipt(bundle(), 'retention'),
            ],
        };
        const result = await new NativePilotCommonObservationService({
            prepared,
            evidenceRoot: f.root,
        }).project(step, selection, facts);
        assert.equal(result.checks.find((c) => c.id === 'fresh-native-process').satisfied, false);
        assert.equal(
            result.checks.find((c) => c.id === 'read-only-mcp-preserved-state').satisfied,
            false,
        );
        assert.equal(result.checks.find((c) => c.id === 'snapshots-preserved').satisfied, false);
        assert.equal(result.loaded, null);
    } finally {
        f.remove();
    }
});
