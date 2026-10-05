import { posix as syntheticPath } from 'node:path';
const syntheticContainerHome = syntheticPath.join('/', 'home', 'node');
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
import { join } from 'node:path';
import { fixture } from '../../helpers/NativeCodexMeasuredFixture.mjs';
import { NativePilotCommonObservationService } from '../../../src/service/NativePilotCommonObservationService.ts';
import { NativePilotCommonPhaseService } from '../../../src/service/NativePilotCommonPhaseService.ts';
import {
    NativePilotInventoryRepository,
    pilotDigest,
} from '../../../src/repository/NativePilotInventoryRepository.ts';
const uuid = '8a7d0a7e-b672-478c-bb12-03a1a81d3e98';
const selection = { run_id: uuid, host: 'codex', repetition: 1 };
const nativeProcess = { status: 'completed', exit_code: 0, signal: null };

async function packetFixture(phase = 'observe-a', pin = 'a') {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'i9-codex-packet-fixture-'));
    mkdirSync(join(root, 'input'));
    mkdirSync(join(root, 'evidence'));
    const f = await fixture(51, (selected) => {
        selected.phase =
            phase === 'observe-restored-a'
                ? 'rollback'
                : phase === 'observe-b'
                  ? 'update'
                  : 'install';
        const catalog = {
            schema_version: 1,
            skills: selected.skills.map((skill) => ({
                ...skill,
                path: '.agents/skills/' + skill.name,
            })),
        };
        const hook = selected.hooks[0];
        const hooks = {
            hooks: {
                SessionStart: [
                    {
                        matcher: hook.matcher,
                        hooks: [
                            {
                                type: 'command',
                                command: hook.command,
                                timeout: hook.timeoutSec,
                                additionalContextLimit: hook.additionalContextLimit,
                            },
                        ],
                    },
                ],
            },
        };
        for (const key of ['source_a', 'source_b']) {
            const source = join(root, 'input', key);
            mkdirSync(source);
            mkdirSync(join(source, 'hooks'));
            writeFileSync(join(source, 'skills-catalog.json'), JSON.stringify(catalog) + '\n');
            writeFileSync(join(source, 'hooks/codex.json'), JSON.stringify(hooks) + '\n');
            for (const skill of selected.skills) {
                const dir = join(source, '.agents/skills', skill.name);
                mkdirSync(dir, { recursive: true });
                writeFileSync(join(dir, 'SKILL.md'), 'Synthetic selected resource.\n');
            }
        }
        selected.artifactInventory = new NativePilotInventoryRepository().tree(
            join(root, 'input/source_a'),
        );
    });
    const s = f.selected,
        tree = s.input.artifactInventory;
    const contract = {
        schema_version: 2,
        purpose: 'local-source-a-b-a',
        authority: { platform: 'linux/arm64' },
        source_a: tree,
        source_b: tree,
        binaries: { codex: { version: '0.160.0' } },
        observer: { entrypoint: 'src/transport/NativeCodexObserverRunner.ts' },
    };
    const prepared = {
        root,
        contract,
        trees: { source_a: tree, source_b: tree, driver: tree, observer: tree },
    };
    const prefix = uuid + '-codex-r1-' + phase,
        common = 'common-' + uuid + '-codex-1-' + phase;
    const entries = [];
    const add = (path, value, raw = false) => {
        const data = raw ? Buffer.from(value) : Buffer.from(JSON.stringify(value) + '\n');
        const entry = {
            path,
            kind: 'file',
            bytes: data.length,
            sha256: pilotDigest(data),
            target: null,
            base64: data.toString('base64'),
        };
        entries.push(entry);
        return { path, bytes: entry.bytes, sha256: entry.sha256 };
    };
    const stateArtifacts = s.states.flatMap((state) =>
        state.artifacts.map((file) => {
            const receipt = add(
                prefix + '/' + file.path,
                readFileSync(join(f.root, 'output', file.path)),
                true,
            );
            return { ...receipt, role: file.role };
        }),
    );
    s.states.forEach(
        (state) =>
            (state.artifacts = state.artifacts.map((file) => ({
                ...file,
                path: prefix + '/' + file.path,
            }))),
    );
    s.report.observation.read_only_mcp.snapshots = stateArtifacts;
    const observerSelection = { runId: uuid, host: 'codex', repetition: 1, phase, pin };
    const report = { schema_version: 1, ...observerSelection, ...s.report, unmeasured: [] };
    add(prefix + '/input.json', {
        schema: s.input.schema,
        phase: s.input.phase,
        imageHome: s.input.imageHome,
        pluginId: s.input.pluginId,
        artifactInventory: s.input.artifactInventory,
        skills: s.input.skills,
        hooks: s.input.hooks,
        resource: s.input.resource,
    });
    const evidence = [
        ...stateArtifacts,
        add(prefix + '/process-identity.json', s.identity),
        add(prefix + '/process-events.json', s.events),
        add(prefix + '/request.jsonl', s.request, true),
        add(prefix + '/stdout.jsonl', s.stdout, true),
        add(prefix + '/stderr.log', s.stderr, true),
        add(prefix + '/fixture-request.json', s.fixture_request, true),
        add(prefix + '/fixture-response.sse', s.fixture_response, true),
        add(prefix + '/fixture-exchanges.json', s.fixture_metadata),
        add(prefix + '/observation.json', report),
    ];
    const compact = {
        schema_version: 1,
        ...observerSelection,
        status: 'observed',
        native_acceptance: false,
        evidence_root: '/pilot/native-output/' + prefix,
        evidence: evidence.map((file) =>
            file.role ? file : { ...file, path: file.path.slice(prefix.length + 1) },
        ),
    };
    const calls = new NativePilotCommonPhaseService().calls({ ...selection, phase, pin }, contract);
    const parentStat = Buffer.from(
        '100 (synthetic node observer) S ' +
            ['90', ...Array(17).fill('0'), '23456', '0'].join(' ') +
            '\n',
    );
    const processRow = {
        ...calls[0],
        process: nativeProcess,
        pid: 100,
        start_ticks: '23456',
        stdout: add(common + '/observer.stdout', JSON.stringify(compact) + '\n', true),
        stderr: add(common + '/observer.stderr', '', true),
        identity: add(common + '/observer-identity.json', {
            schema_version: 2,
            status: 'observed',
            pid: 100,
            start_ticks: '23456',
            executable: '/pilot/runtime-bin/node',
            observer_pid: 90,
            stat_before: {
                bytes: parentStat.length,
                sha256: pilotDigest(parentStat),
                base64: parentStat.toString('base64'),
            },
            stat_after: {
                bytes: parentStat.length,
                sha256: pilotDigest(parentStat),
                base64: parentStat.toString('base64'),
            },
        }),
    };
    const snapshots = [];
    for (const [index, label] of ['before', 'after'].entries()) {
        const state = s.states[index].snapshot;
        snapshots.push({
            ...add(common + '/' + label + '-state.json', state),
            role: 'state-observation',
        });
        for (const file of state.files) {
            const original = readFileSync(
                join(
                    f.root,
                    'output',
                    index ? 'mcp-after-sqlite-copy' : 'mcp-before-sqlite-copy',
                    file.name,
                ),
            );
            snapshots.push({
                ...add(common + '/' + label + '-sqlite-copy/' + file.name, original, true),
                role: 'state-bytes',
            });
        }
        snapshots.push({
            ...add(common + '/' + label + '-source.json', tree),
            role: 'source-inventory',
        });
        snapshots.push({
            ...add(common + '/' + label + '-consumer.json', tree),
            role: 'consumer-inventory',
        });
    }
    const commonStat = Buffer.from(
        '90 (synthetic common) S ' + ['80', ...Array(17).fill('0'), '22222', '0'].join(' ') + '\n',
    );
    const commonRaw = {
        bytes: commonStat.length,
        sha256: pilotDigest(commonStat),
        base64: commonStat.toString('base64'),
    };
    const packet = {
        schema_version: 2,
        kind: 'native-common-phase-evidence',
        selection,
        phase,
        pin,
        native_acceptance: false,
        context: {
            common_process: {
                pid: 90,
                worker_pid: 80,
                identity: add(common + '/common-self.json', {
                    schema_version: 2,
                    status: 'observed',
                    pid: 90,
                    observer_pid: 80,
                    start_ticks: '22222',
                    executable: '/pilot/runtime-bin/node',
                    stat_before: commonRaw,
                    stat_after: commonRaw,
                }),
            },
        },
        processes: [processRow],
        snapshots,
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
        operation: 'observe',
        pin,
        commands: [{ executable: 'fixed-owned-worker', args: [] }],
        checks: [
            'complete-loaded-skill-inventory',
            'loaded-source-matches-pin',
            'native-hook-output-observed',
            'native-mcp-initialized',
            'read-only-mcp-preserved-state',
            'one-local-response-no-auth-no-tools-no-provider',
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
            path: name === 'home' ? syntheticContainerHome : '/pilot/' + name,
            entries: name === 'native-output' ? entries : [],
        })),
    };
    const receipt = (path, value, kind) => {
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        writeFileSync(join(root, 'evidence', path), bytes);
        return { path, bytes: bytes.length, sha256: pilotDigest(bytes), kind };
    };
    const facts = {
        schema_version: 1,
        phase,
        selection,
        native_acceptance: false,
        container_id: 'b'.repeat(64),
        commands: [{ process: nativeProcess, stdout, stderr: '' }],
        evidence: [
            receipt(
                'actual-process.json',
                {
                    planned_command: step.commands[0],
                    observation: {
                        operation: 'execute',
                        phase,
                        index: 0,
                        process_identity: {
                            schema_version: 1,
                            worker_pid: 80,
                            child_pid: 90,
                            executable: '/pilot/runtime-bin/node',
                        },
                        process: nativeProcess,
                        stdout,
                        stderr: '',
                    },
                },
                'process',
            ),
            receipt('phase-export.json', exported, 'retention'),
        ],
    };
    return {
        root,
        prepared,
        step,
        facts,
        remove() {
            f.remove();
            rmSync(root, { recursive: true, force: true });
        },
    };
}

test('full static packet path binds selected source bytes, native transcript and inner state before returning loaded evidence', async () => {
    const f = await packetFixture();
    try {
        const result = await new NativePilotCommonObservationService({
            prepared: f.prepared,
            evidenceRoot: join(f.root, 'evidence'),
        }).project(f.step, selection, f.facts);
        assert.ok(result.checks.every((check) => check.satisfied));
        assert.equal(result.loaded.source_tree_sha256, f.prepared.trees.source_a.tree_sha256);
        assert.ok(
            result.evidence.some(
                (file) =>
                    file.path === result.loaded.inventory_evidence && file.kind === 'inventory',
            ),
        );
        assert.equal(result.rollback_state, null);
    } finally {
        f.remove();
    }
});

test('restored A compatibility is projected only after verified prior runtime state and preserved rows', async () => {
    const a = await packetFixture(),
        b = await packetFixture('observe-b', 'b'),
        restored = await packetFixture('observe-restored-a', 'restored-a');
    try {
        const service = new NativePilotCommonObservationService({
            prepared: a.prepared,
            evidenceRoot: join(a.root, 'evidence'),
        });
        const project = async (f) => {
            const facts = structuredClone(f.facts);
            if (f !== a)
                for (const receipt of facts.evidence) {
                    const original = receipt.path;
                    receipt.path = f.step.id + '-' + original;
                    copyFileSync(
                        join(f.root, 'evidence', original),
                        join(a.root, 'evidence', receipt.path),
                    );
                }
            return service.project(f.step, selection, facts);
        };
        assert.equal((await project(a)).rollback_state, null);
        assert.equal((await project(b)).rollback_state, null);
        const result = await project(restored);
        assert.equal(result.rollback_state.result, 'compatible');
        assert.equal(result.rollback_state.evidence.length, 2);
        assert.notEqual(result.rollback_state.evidence[0], result.rollback_state.evidence[1]);
        assert.ok(
            result.rollback_state.evidence.every((path) =>
                result.evidence.some(
                    (receipt) => receipt.path === path && receipt.kind === 'state',
                ),
            ),
        );
        assert.equal(result.loaded.source_tree_sha256, a.prepared.trees.source_a.tree_sha256);
    } finally {
        a.remove();
        b.remove();
        restored.remove();
    }
});

test('unchanged restored source alone cannot claim rollback compatibility without verified preceding state', async () => {
    const f = await packetFixture('observe-restored-a', 'restored-a');
    try {
        const result = await new NativePilotCommonObservationService({
            prepared: f.prepared,
            evidenceRoot: join(f.root, 'evidence'),
        }).project(f.step, selection, f.facts);
        assert.equal(result.rollback_state, null);
    } finally {
        f.remove();
    }
});

export { packetFixture };
