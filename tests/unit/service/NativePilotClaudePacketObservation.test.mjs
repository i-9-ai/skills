// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fixture, sourceFiles } from '../../helpers/NativeClaudeObservationFixture.mjs';
import { consumeLoadedProjection } from '../../helpers/NativePilotLoadedProjectionFixture.mjs';
import { NativePilotCommonObservationService } from '../../../src/service/NativePilotCommonObservationService.ts';
import { NativePilotCommonPhaseService } from '../../../src/service/NativePilotCommonPhaseService.ts';
import { NativeClaudeObservationValidator } from '../../../src/validator/NativeClaudeObservationValidator.ts';
import { NativePilotNpmEnvironmentRepository } from '../../../src/repository/NativePilotNpmEnvironmentRepository.ts';
import { NativePilotStateSnapshotRepository } from '../../../src/repository/NativePilotStateSnapshotRepository.ts';
import { NativePilotConfiguration } from '../../../src/config/NativePilotConfiguration.ts';
import {
    NativePilotInventoryRepository,
    pilotDigest,
} from '../../../src/repository/NativePilotInventoryRepository.ts';

function packetFixture(phase = 'observe-a', additionalResources = 0) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'i9-native-state-fixture-'));
    const output = join(root, 'output');
    const home = join(root, 'home');
    mkdirSync(output);
    mkdirSync(home);
    mkdirSync(join(root, 'evidence'));
    const f = fixture(phase),
        selection = { run_id: f.selection.run_id, host: 'claude', repetition: 1 };
    // These complete ordinary fixtures have real directory entries, just like prepared inputs.
    const inventory = new NativePilotInventoryRepository();
    const trees = {};
    for (const pin of ['a', 'b']) {
        const sourceRoot = join(root, 'input', 'source_' + pin);
        const files = { ...sourceFiles(pin) };
        for (let index = 0; index < additionalResources; index++)
            files[
                `.agents/skills/skill-fixture/references/complete-resource-${String(index).padStart(4, '0')}.md`
            ] = Buffer.from(`Synthetic complete resource ${pin}/${index}.\n`);
        for (const [path, bytes] of Object.entries(files)) {
            mkdirSync(dirname(join(sourceRoot, path)), { recursive: true });
            writeFileSync(join(sourceRoot, path), bytes, { flag: 'wx', mode: 0o600 });
        }
        trees[pin] = inventory.tree(sourceRoot);
    }
    const a = trees.a,
        b = trees.b;
    for (const snapshot of [f.before, f.after]) {
        snapshot.selected_inventory = snapshot.pin === 'b' ? b : a;
        snapshot.actual_inventory = snapshot.selected_inventory;
    }
    const source = f.before.selected_inventory;
    const contract = {
        ...f.contract,
        schema_version: 2,
        purpose: 'local-source-a-b-a',
        authority: { platform: 'linux/arm64' },
        source_a: a,
        source_b: b,
        binaries: {
            node: { version: '24.21.0', sha256: '1'.repeat(64) },
            codex: { version: '0.160.0', sha256: '2'.repeat(64) },
            claude: { version: '2.1.285', sha256: '3'.repeat(64) },
        },
        observer: { entrypoint: 'dist/transport/NativePilotNativeObserverRunner.js' },
    };
    f.contract = contract;
    const prepared = {
        root,
        contract,
        trees: { source_a: a, source_b: b, driver: a, observer: a },
    };
    const rawPrefix = `${selection.run_id}-claude-r1-${phase}-raw`,
        common = `common-${selection.run_id}-claude-1-${phase}`;
    const entries = [],
        rawEvidence = [];
    const add = (path, value, raw = false) => {
        const data = raw ? Buffer.from(value) : Buffer.from(JSON.stringify(value) + '\n');
        const item = {
            path,
            kind: 'file',
            bytes: data.length,
            sha256: pilotDigest(data),
            target: null,
            base64: data.toString('base64'),
        };
        entries.push(item);
        return { path, bytes: item.bytes, sha256: item.sha256 };
    };
    const raw = (name, value, binary = false) => {
        const receipt = add(rawPrefix + '/' + name, value, binary);
        const relative = { ...receipt, path: name };
        rawEvidence.push(relative);
        return receipt;
    };
    const environment = [
        'HOME=' + posix.join('/', 'home', 'node'),
        'PATH=/pilot/runtime-bin:/usr/bin:/bin',
        'LANG=C.UTF-8',
        'HOSTNAME=synthetic',
        'NODE_VERSION=24.21.0',
        'YARN_VERSION=1.22.22',
    ];
    const hashes = {
        source_a: a.tree_sha256,
        source_b: b.tree_sha256,
        driver: a.tree_sha256,
        observer: a.tree_sha256,
        node: contract.binaries.node.sha256,
        codex: contract.binaries.codex.sha256,
        claude: contract.binaries.claude.sha256,
        source: source.tree_sha256,
        consumer: a.tree_sha256,
    };
    raw('context.json', {
        schema_version: 1,
        mode: 'native',
        contract,
        nonce: 'a'.repeat(32),
        selection: f.selection,
        account: { name: 'node', uid: 1000, gid: 1000, home: posix.join('/', 'home', 'node') },
        environment: [
            ...environment,
            ...Object.entries(NativePilotNpmEnvironmentRepository.additions).map(
                ([k, v]) => `${k}=${v}`,
            ),
        ].sort(),
        platform: 'linux/arm64',
        observer_pid: 42,
        observer_start_ticks: '777',
        no_new_privileges: '1',
        seccomp: '2',
        capabilities: {
            CapEff: '0000000000000000',
            CapPrm: '0000000000000000',
            CapBnd: '0000000000000000',
        },
        routes: [],
        inputs: hashes,
        evidence_scope: 'context-measurement-only',
    });
    for (const [index, record] of f.records.entries()) {
        const stem = `${String(index + 1).padStart(2, '0')}-${record.command.label}`;
        raw(stem + '-request.json', record.command);
        const { stdout, stderr, ...process } = record.process;
        raw(stem + '-process.json', { label: record.command.label, ...process });
        raw(stem + '.stdout', stdout, true);
        raw(stem + '.stderr', stderr, true);
    }
    raw('source-before.json', f.before);
    raw('source-after.json', f.after);
    raw('claude-diagnostic.log', f.diagnostic, true);
    const state = new NativePilotStateSnapshotRepository({ home, outputRoot: output });
    state.seed(selection.run_id);
    const before = state.snapshot('mcp-before'),
        after = state.snapshot('mcp-after');
    const snapshots = ['mcp-before', 'mcp-after'].flatMap((label) =>
        state.artifacts(label).map((receipt) => ({
            ...raw(receipt.path, readFileSync(join(output, receipt.path)), true),
            role: receipt.path.endsWith('-state.json')
                ? label === 'mcp-before'
                    ? 'state-before-mcp'
                    : 'state-after-mcp'
                : 'state-bytes',
        })),
    );
    const mcp = {
        schema_version: 1,
        scope: 'native-mcp-health-reads-before-init',
        status: 'captured',
        reason: 'synthetic completed health reads',
        preservation: 'existing_unchanged',
        snapshots,
    };
    raw('mcp-state.json', mcp);
    const report = {
        schema_version: 2,
        selection: f.selection,
        mode: 'native',
        status: 'captured',
        reason: 'retained',
        native_acceptance: false,
        diagnostic_status: 'retained',
        init_attempted: true,
        processes: f.records.map((record) => {
            const { stdout, stderr, ...p } = record.process;
            return { label: record.command.label, ...p };
        }),
        semantic_checks: new NativeClaudeObservationValidator().project(f),
        mcp_state: mcp,
        lifecycle_checks: 'not-run',
        unmeasured: [],
    };
    raw('observation.json', report);
    const compact = {
        schema_version: 2,
        ...f.selection,
        status: 'captured',
        reason: 'retained',
        native_acceptance: false,
        semantic_status: 'observed',
        evidence_root: '/pilot/native-output/' + rawPrefix,
        evidence: rawEvidence,
    };
    const stat = (pid, parent, ticks) => {
        const bytes = Buffer.from(
            `${pid} (synthetic node) S ${[String(parent), ...Array(17).fill('0'), ticks, '0'].join(' ')}\n`,
        );
        const raw = {
            bytes: bytes.length,
            sha256: pilotDigest(bytes),
            base64: bytes.toString('base64'),
        };
        return {
            schema_version: 2,
            status: 'observed',
            pid,
            observer_pid: parent,
            start_ticks: ticks,
            executable: '/pilot/runtime-bin/node',
            stat_before: raw,
            stat_after: raw,
        };
    };
    const selectedPin =
        phase === 'observe-b' ? 'b' : phase === 'observe-restored-a' ? 'restored-a' : 'a';
    const calls = new NativePilotCommonPhaseService().calls(
        { ...selection, phase, pin: selectedPin },
        contract,
    );
    const process = { status: 'completed', exit_code: 0, signal: null };
    const processes = [
        {
            ...calls[0],
            process,
            pid: 42,
            start_ticks: '777',
            stdout: add(common + '/observer.stdout', JSON.stringify(compact) + '\n', true),
            stderr: add(common + '/observer.stderr', '', true),
            identity: add(common + '/observer-identity.json', stat(42, 90, '777')),
        },
    ];
    const outerSnapshots = [];
    for (const [index, label] of ['before', 'after'].entries()) {
        outerSnapshots.push(
            {
                role: 'state-observation',
                ...add(common + '/' + label + '-state.json', index ? after : before),
            },
            { role: 'source-inventory', ...add(common + '/' + label + '-source.json', source) },
            { role: 'consumer-inventory', ...add(common + '/' + label + '-consumer.json', a) },
        );
        for (const receipt of state
            .artifacts(index ? 'mcp-after' : 'mcp-before')
            .filter((row) => !row.path.endsWith('-state.json')))
            outerSnapshots.push({
                role: 'state-bytes',
                ...add(
                    common + '/' + label + '-sqlite-copy/' + receipt.path.split('/').at(-1),
                    readFileSync(join(output, receipt.path)),
                    true,
                ),
            });
    }
    const packet = {
        schema_version: 2,
        kind: 'native-common-phase-evidence',
        selection,
        phase,
        pin: selectedPin,
        native_acceptance: false,
        context: {
            common_process: {
                pid: 90,
                worker_pid: 80,
                identity: add(common + '/self-identity.json', stat(90, 80, '222')),
            },
        },
        processes,
        snapshots: outerSnapshots,
        result: 'observed',
        blocked_gate: null,
        unclaimed: [],
    };
    const compactCommon = {
        schema_version: 2,
        kind: 'native-common-phase-receipt',
        selection,
        phase,
        native_acceptance: false,
        report: add(common + '/phase.json', packet),
    };
    const stdout = JSON.stringify(compactCommon) + '\n';
    const step = {
        id: phase,
        pin: selectedPin,
        operation: 'observe',
        commands: [{ executable: '/pilot/runtime-bin/node', args: ['fixed-owned-worker'] }],
        checks: [
            'fresh-native-process',
            'enabled-native-registration',
            'complete-loaded-skill-inventory',
            'loaded-source-matches-pin',
            'native-session-hook-completed',
            'native-hook-output-observed',
            'native-mcp-initialized',
            'read-only-mcp-preserved-state',
            'source-and-consumer-unchanged',
        ],
    };
    const audit = {
        quiescent: true,
        status: 'quiescent',
        samples: [{}, {}],
        blocking_sockets: [],
        listeners: [],
    };
    const exported = {
        schema_version: 1,
        operation: 'export',
        nonce: 'a'.repeat(32),
        selection,
        audit,
        roots: ['home', 'state', 'work', 'native-output'].map((name) => ({
            name,
            path: name === 'home' ? posix.join('/', 'home', 'node') : '/pilot/' + name,
            entries: name === 'native-output' ? entries : [],
        })),
    };
    const receipt = (name, value, kind) => {
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        writeFileSync(join(root, 'evidence', name), bytes);
        return { path: name, bytes: bytes.length, sha256: pilotDigest(bytes), kind };
    };
    const facts = {
        schema_version: 1,
        phase,
        selection,
        native_acceptance: false,
        container_id: 'b'.repeat(64),
        commands: [{ process, stdout, stderr: '' }],
        evidence: [
            receipt(
                'process.json',
                {
                    planned_command: step.commands[0],
                    observation: {
                        operation: 'execute',
                        phase,
                        index: 0,
                        process,
                        stdout,
                        stderr: '',
                        process_identity: {
                            schema_version: 1,
                            worker_pid: 80,
                            child_pid: 90,
                            executable: '/pilot/runtime-bin/node',
                        },
                    },
                },
                'process',
            ),
            receipt('export.json', exported, 'retention'),
        ],
    };
    return {
        root,
        step,
        selection,
        facts,
        prepared,
        environment,
        packet,
        report,
        exported,
        remove: () => rmSync(root, { recursive: true, force: true }),
    };
}

// Reconcile all receipt levels after changing a synthetic report. These probes
// exercise semantic completeness rather than relying on an old-hash rejection.
function rewritePacket(f, change) {
    const entries = f.exported.roots.find((root) => root.name === 'native-output').entries;
    const map = new Map(entries.map((entry) => [entry.path, entry]));
    const set = (entry, value) => {
        const data = Buffer.from(JSON.stringify(value) + '\n');
        entry.bytes = data.length;
        entry.sha256 = pilotDigest(data);
        entry.base64 = data.toString('base64');
    };
    change(entries, set);
    for (let iteration = 0; iteration < 8; iteration++) {
        for (const entry of entries) {
            let value;
            try {
                value = JSON.parse(Buffer.from(entry.base64, 'base64'));
            } catch {
                continue;
            }
            const update = (node) => {
                if (!node || typeof node !== 'object') return;
                const targets = node.path
                    ? [...map.values()].filter(
                          (entry) =>
                              entry.path === node.path || entry.path.endsWith('/' + node.path),
                      )
                    : [];
                if (
                    node.path &&
                    Object.hasOwn(node, 'bytes') &&
                    Object.hasOwn(node, 'sha256') &&
                    targets.length === 1
                ) {
                    const target = targets[0];
                    node.bytes = target.bytes;
                    node.sha256 = target.sha256;
                }
                for (const child of Object.values(node)) update(child);
            };
            update(value);
            set(entry, value);
        }
    }
    const phase = entries.find((entry) => entry.path.endsWith('/phase.json'));
    const compact = JSON.parse(f.facts.commands[0].stdout);
    compact.report.bytes = phase.bytes;
    compact.report.sha256 = phase.sha256;
    f.facts.commands[0].stdout = JSON.stringify(compact) + '\n';
    for (const receipt of f.facts.evidence) {
        const path = join(f.root, 'evidence', receipt.path);
        const value = receipt.kind === 'retention' ? f.exported : JSON.parse(readFileSync(path));
        if (value.observation) value.observation.stdout = f.facts.commands[0].stdout;
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        writeFileSync(path, bytes);
        receipt.bytes = bytes.length;
        receipt.sha256 = pilotDigest(bytes);
    }
}

for (const [label, change] of [
    [
        'empty existing inventory',
        (value) => {
            value.files = [];
        },
    ],
    [
        'duplicate main file',
        (value) => {
            value.files.push({ ...value.files[0] });
        },
    ],
    [
        'missing main database',
        (value) => {
            value.files[0].name = 'skills-usage.db-wal';
        },
    ],
    [
        'unsafe byte bound',
        (value) => {
            value.files[0].bytes = 33_554_433;
        },
    ],
])
    test(`rehashed narrow MCP ${label} cannot prove state preservation`, async () => {
        const f = packetFixture();
        try {
            rewritePacket(f, (entries, set) => {
                for (const entry of entries.filter((row) =>
                    /-raw\/mcp-(before|after)-state\.json$/.test(row.path),
                )) {
                    const value = JSON.parse(Buffer.from(entry.base64, 'base64'));
                    change(value);
                    value.state_sha256 = pilotDigest(JSON.stringify(value.files));
                    set(entry, value);
                }
            });
            const service = new NativePilotCommonObservationService({
                prepared: f.prepared,
                evidenceRoot: join(f.root, 'evidence'),
            });
            service.prior.set('probe', { environment: f.environment });
            await assert.rejects(
                service.project(f.step, f.selection, f.facts),
                /projection_state_/,
            );
        } finally {
            f.remove();
        }
    });

test('a valid file inventory cannot omit an exported sidecar or its explicit inner receipt', async () => {
    for (const missingReceipt of [false, true]) {
        const f = packetFixture();
        try {
            rewritePacket(f, (entries, set) => {
                if (!missingReceipt) {
                    const db = entries.find((row) =>
                        row.path.includes('-raw/mcp-before-sqlite-copy/skills-usage.db'),
                    );
                    entries.push({ ...db, path: db.path + '-wal' });
                } else {
                    for (const entry of entries.filter((row) =>
                        /-raw\/(?:mcp-state|observation)\.json$/.test(row.path),
                    )) {
                        const value = JSON.parse(Buffer.from(entry.base64, 'base64'));
                        const mcp = value.mcp_state ?? value;
                        mcp.snapshots = mcp.snapshots.filter(
                            (row) => !row.path.endsWith('mcp-before-sqlite-copy/skills-usage.db'),
                        );
                        set(entry, value);
                    }
                }
            });
            const service = new NativePilotCommonObservationService({
                prepared: f.prepared,
                evidenceRoot: join(f.root, 'evidence'),
            });
            service.prior.set('probe', { environment: f.environment });
            await assert.rejects(
                service.project(f.step, f.selection, f.facts),
                /projection_state_incomplete/,
            );
        } finally {
            f.remove();
        }
    }
});

test('complete common Claude packet derives supported runtime and exact seeded MCP state from raw exported bytes', async () => {
    const f = packetFixture();
    try {
        const service = new NativePilotCommonObservationService({
            prepared: f.prepared,
            evidenceRoot: join(f.root, 'evidence'),
        });
        service.prior.set('probe', { environment: f.environment });
        const result = await service.project(f.step, f.selection, f.facts);
        assert.ok(result.checks.every((row) => row.satisfied));
        assert.equal(result.loaded.source_tree_sha256, f.prepared.trees.source_a.tree_sha256);
        assert.equal(result.rollback_state, null);
    } finally {
        f.remove();
    }
});

test('actual Claude producer inventories reach Driver for A, B and restored A without changing cache scope', async (t) => {
    const a = packetFixture(),
        b = packetFixture('observe-b'),
        restored = packetFixture('observe-restored-a');
    try {
        const evidenceRoot = join(a.root, 'evidence');
        const service = new NativePilotCommonObservationService({
            prepared: a.prepared,
            evidenceRoot,
        });
        service.prior.set('probe', { environment: a.environment });
        for (const f of [a, b, restored]) {
            const facts = structuredClone(f.facts);
            if (f !== a)
                for (const receipt of facts.evidence) {
                    const original = receipt.path;
                    receipt.path = f.step.id + '-' + original;
                    copyFileSync(
                        join(f.root, 'evidence', original),
                        join(evidenceRoot, receipt.path),
                    );
                }
            const projected = await service.project(f.step, f.selection, facts);
            assert.ok(projected.checks.every((row) => row.satisfied));
            const retained = JSON.parse(
                readFileSync(join(evidenceRoot, projected.loaded.inventory_evidence)),
            );
            assert.equal(retained.native_cache_scope, 'selected-manifest-and-registration-only');
            await consumeLoadedProjection(t, f, projected, f.selection, evidenceRoot);
        }
    } finally {
        a.remove();
        b.remove();
        restored.remove();
    }
});

test('complete six-inventory Claude producer above one MiB reaches Driver without a compatibility claim', async (t) => {
    const f = packetFixture('observe-a', 1100);
    try {
        const evidenceRoot = join(f.root, 'evidence');
        const service = new NativePilotCommonObservationService({
            prepared: f.prepared,
            evidenceRoot,
        });
        service.prior.set('probe', { environment: f.environment });
        const projected = await service.project(f.step, f.selection, f.facts);
        const path = join(evidenceRoot, projected.loaded.inventory_evidence);
        const bytes = readFileSync(path);
        assert.ok(bytes.length > 1_048_576);
        assert.ok(bytes.length < NativePilotConfiguration.limits.loaded_inventory_bytes);
        assert.ok(f.prepared.trees.source_a.entries.length >= 1074);
        t.diagnostic(
            JSON.stringify({
                source_entries: f.prepared.trees.source_a.entries.length,
                loaded_envelope_bytes: bytes.length,
                repeated_inventories: 6,
            }),
        );
        const envelope = JSON.parse(bytes);
        for (const inventory of [
            envelope.source_before.selected_inventory,
            envelope.source_before.actual_inventory,
            envelope.source_after.selected_inventory,
            envelope.source_after.actual_inventory,
            ...envelope.independent_worker_source,
        ])
            assert.deepEqual(inventory, f.prepared.trees.source_a);
        assert.throws(() => new NativePilotInventoryRepository().readJson(path));
        const lane = await consumeLoadedProjection(t, f, projected, f.selection, evidenceRoot);
        assert.equal(lane.data_compatibility, 'not-exercised');
        assert.equal(lane.native_acceptance, false);
    } finally {
        f.remove();
    }
});

for (const [label, change] of [
    [
        'unknown envelope field',
        (value) => {
            value.unrecognized = true;
        },
    ],
    [
        'omitted complete inventory',
        (value) => {
            value.source_after.actual_inventory.entries.pop();
        },
    ],
    [
        'changed selected source digest',
        (value) => {
            value.source_tree_sha256 = '0'.repeat(64);
        },
    ],
])
    test(`Driver rejects rehashed large Claude ${label} after the dedicated read`, async (t) => {
        const f = packetFixture('observe-a', 1100);
        try {
            const evidenceRoot = join(f.root, 'evidence');
            const service = new NativePilotCommonObservationService({
                prepared: f.prepared,
                evidenceRoot,
            });
            service.prior.set('probe', { environment: f.environment });
            const projected = await service.project(f.step, f.selection, f.facts);
            const path = join(evidenceRoot, projected.loaded.inventory_evidence);
            const value = JSON.parse(readFileSync(path));
            change(value);
            const bytes = Buffer.from(JSON.stringify(value) + '\n');
            assert.ok(bytes.length > 1_048_576);
            writeFileSync(path, bytes);
            const receipt = projected.evidence.find(
                (row) => row.path === projected.loaded.inventory_evidence,
            );
            receipt.bytes = bytes.length;
            receipt.sha256 = pilotDigest(bytes);
            assert.deepEqual(
                new NativePilotInventoryRepository().readLoadedInventoryJson(path, receipt),
                value,
            );
            const lane = await consumeLoadedProjection(
                t,
                f,
                projected,
                f.selection,
                evidenceRoot,
                'blocked',
            );
            assert.equal(
                lane.steps.find((step) => step.id === 'observe-a').reason,
                'evidence-integrity-mismatch',
            );
        } finally {
            f.remove();
        }
    });

test('missing worker PID correlation rejects before selected Claude collector can become authority', async () => {
    const f = packetFixture();
    try {
        const receipt = f.facts.evidence[0],
            path = join(f.root, 'evidence', receipt.path);
        const value = JSON.parse(readFileSync(path, 'utf8'));
        value.observation.process_identity.child_pid = 91;
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        writeFileSync(path, bytes);
        receipt.bytes = bytes.length;
        receipt.sha256 = pilotDigest(bytes);
        await assert.rejects(
            new NativePilotCommonObservationService({
                prepared: f.prepared,
                evidenceRoot: join(f.root, 'evidence'),
            }).project(f.step, f.selection, f.facts),
            /projection_common_worker_identity/,
        );
    } finally {
        f.remove();
    }
});
