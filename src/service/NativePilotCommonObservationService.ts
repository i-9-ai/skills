// SPDX-License-Identifier: Apache-2.0
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type { NativePilotSelection, NativePilotStep } from '../config/NativePilotConfiguration.ts';
import type { NativePilotPreparation } from '../repository/NativePilotPreparationRepository.ts';
import type { NativePilotControllerFacts } from './NativePilotContainerService.ts';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeCodexObserverDispatcher } from './NativeCodexObserverDispatcher.ts';
import { NativePilotCodexObservationService } from './NativePilotCodexObservationService.ts';
import { NativeCodexProtocolValidator } from '../validator/NativeCodexProtocolValidator.ts';
import { NativeCodexSchemaRepository } from '../repository/NativeCodexSchemaRepository.ts';
import { NativePilotCommonPhaseService } from './NativePilotCommonPhaseService.ts';
import {
    NativePilotObservationEvidenceRepository,
    projectionDigest,
    projectionObject,
    projectionPath,
} from '../repository/NativePilotObservationEvidenceRepository.ts';
import type { NativePilotProjectionReceipt } from '../repository/NativePilotObservationEvidenceRepository.ts';
import { NativePilotStateSchemaValidator } from '../validator/NativePilotStateSchemaValidator.ts';
import { NativePilotRegistrationObservationValidator } from '../validator/NativePilotRegistrationObservationValidator.ts';
import type { NativePilotRegistrationRecord } from '../validator/NativePilotRegistrationObservationValidator.ts';
import { NativePilotClaudeObservationService } from './NativePilotClaudeObservationService.ts';
import { NativeClaudeRawConfiguration } from '../config/NativeClaudeRawConfiguration.ts';
import type { NativeClaudeObservationRecord } from '../validator/NativeClaudeObservationValidator.ts';

/** Trusted bundled host projection. Selected observer code is never loaded in this process. */
export class NativePilotCommonObservationService {
    private readonly prepared: NativePilotPreparation;
    private readonly files: NativePilotObservationEvidenceRepository;
    private readonly prior = new Map<string, any>();
    private profile: string | null = null;
    private nonce: string | null = null;
    private baselineReceipts: Array<{ path: string; bytes: number; sha256: string }> = [];
    constructor(options: { prepared: NativePilotPreparation; evidenceRoot: string }) {
        this.prepared = structuredClone(options.prepared);
        this.files = new NativePilotObservationEvidenceRepository(options.evidenceRoot);
    }

    async project(
        step: NativePilotStep,
        selection: NativePilotSelection,
        facts: NativePilotControllerFacts,
    ): Promise<unknown> {
        if (
            facts.schema_version !== 1 ||
            facts.native_acceptance !== false ||
            facts.phase !== step.id ||
            JSON.stringify(facts.selection) !== JSON.stringify(selection) ||
            facts.commands.length !== step.commands.length ||
            !facts.evidence.length
        )
            throw new Error('projection_controller_identity');
        const evidence: NativePilotProjectionReceipt[] = facts.evidence.map((file) => ({
            ...file,
        }));
        const retained = evidence.map((file) => ({
            file,
            value: this.files.json(file),
        }));
        const finalWrapper = retained.find(
            (row) => row.value?.format === 'inert-json-records-never-extracted',
        );
        if (finalWrapper) {
            const raw = finalWrapper.value;
            const path = relative(this.files.root, raw.path);
            if (!projectionPath(path)) throw new Error('projection_final_retention_path');
            const file = { path, bytes: raw.bytes, sha256: raw.sha256, kind: 'retention' as const };
            evidence.push(file);
            retained.push({ file, value: this.files.json(file) });
        }
        const checkpoint = retained.find(
            (row) => row.file.kind === 'retention' && row.value?.operation === 'export',
        );
        const bundle = checkpoint ? this.files.export(checkpoint.value, selection) : null;
        if (bundle && this.nonce !== null && bundle.nonce !== this.nonce)
            throw new Error('projection_lane_nonce_changed');
        if (bundle) this.nonce ??= bundle.nonce;
        const prefix = `${selection.run_id}-${selection.host}-${selection.repetition}-${step.id}`;
        const append = (bytes: Uint8Array, kind: NativePilotProjectionReceipt['kind']) => {
            const receipt = this.files.retain(prefix, evidence.length, bytes, kind);
            evidence.push(receipt);
            return receipt;
        };
        const nativeFiles = bundle?.roots.get('native-output');
        const readNative = (receipt: any, kind: NativePilotProjectionReceipt['kind']) => {
            projectionObject(receipt);
            if (!projectionPath(receipt.path)) throw new Error('projection_native_locator');
            const entry = nativeFiles?.get(receipt.path);
            if (!entry || entry.bytes !== receipt.bytes || entry.sha256 !== receipt.sha256)
                throw new Error('projection_native_receipt');
            const data = this.files.decode(entry);
            return { receipt: append(data, kind), data };
        };
        const nativeJson = (receipt: any, kind: NativePilotProjectionReceipt['kind']) => {
            const file = readNative(receipt, kind);
            return {
                ...file,
                value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.data)),
            };
        };
        const commandRecords = retained.filter(
            (row) => row.value?.observation?.operation === 'execute',
        );
        for (const [index, command] of facts.commands.entries()) {
            const actual = commandRecords[index]?.value;
            if (step.id === 'retain') continue; // The fixed export receipt is independently checked below.
            if (
                !actual ||
                JSON.stringify(actual.observation.process) !== JSON.stringify(command.process) ||
                actual.observation.stdout !== command.stdout ||
                actual.observation.stderr !== command.stderr ||
                actual.observation.phase !== step.id ||
                actual.observation.index !== index ||
                JSON.stringify(actual.planned_command) !== JSON.stringify(step.commands[index])
            )
                throw new Error('projection_process_receipt');
            append(Buffer.from(command.stdout), 'native-log');
            append(Buffer.from(command.stderr), 'native-log');
        }
        const satisfied = new Map<string, boolean>();
        const goodProcess = (value: any) =>
            value?.status === 'completed' && value.exit_code === 0 && value.signal === null;
        const probeRecord = retained.find((row) => row.value?.probe?.operation === 'probe');
        const probe = probeRecord?.value.probe;
        const audit =
            retained.filter((row) => row.value?.operation === 'audit').at(-1)?.value ??
            bundle?.audit;
        const quiescent =
            audit?.quiescent === true &&
            ['quiescent', 'quiescent-with-observed-zombies'].includes(audit?.status) &&
            Array.isArray(audit.samples) &&
            audit.samples.length >= 2 &&
            Array.isArray(audit.blocking_sockets) &&
            audit.blocking_sockets.length === 0;
        satisfied.set('owned-native-live-processes-absent', quiescent);
        satisfied.set('owned-listeners-absent', quiescent && audit.listeners?.length === 0);
        const source =
            step.pin === 'b' ? this.prepared.trees.source_b : this.prepared.trees.source_a;
        satisfied.set('active-source-matches-pin', probe?.hashes?.source === source.tree_sha256);
        let environment: any = null;
        let packet: any = null;
        const registrationRecords: NativePilotRegistrationRecord[] = [];
        const registrationValidator = new NativePilotRegistrationObservationValidator();
        const identities = new Map<string, { pid: number; start_ticks: string }>();
        const snapshots: Array<{
            role: string;
            value: any;
            receipt: NativePilotProjectionReceipt;
            data: Buffer;
            path: string;
        }> = [];
        if (facts.commands.length === 1 && step.operation === 'observe' && step.id !== 'retain') {
            if (facts.commands[0].stdout.length > 1_048_576)
                throw new Error('projection_packet_bound');
            const compact = projectionObject(JSON.parse(facts.commands[0].stdout), [
                'schema_version',
                'kind',
                'selection',
                'phase',
                'native_acceptance',
                'report',
            ]);
            if (
                compact.schema_version !== 2 ||
                compact.kind !== 'native-common-phase-receipt' ||
                compact.phase !== step.id ||
                compact.native_acceptance !== false ||
                JSON.stringify(compact.selection) !== JSON.stringify(selection)
            )
                throw new Error('projection_packet_identity');
            const raw = nativeJson(compact.report, 'process');
            packet = projectionObject(raw.value, [
                'schema_version',
                'kind',
                'selection',
                'phase',
                'pin',
                'native_acceptance',
                'context',
                'processes',
                'snapshots',
                'result',
                'blocked_gate',
                'unclaimed',
            ]);
            if (
                packet.schema_version !== 2 ||
                packet.kind !== 'native-common-phase-evidence' ||
                packet.phase !== step.id ||
                packet.pin !== step.pin ||
                packet.native_acceptance !== false ||
                JSON.stringify(packet.selection) !== JSON.stringify(selection) ||
                !Array.isArray(packet.snapshots) ||
                packet.snapshots.length > 64 ||
                !Array.isArray(packet.processes) ||
                packet.processes.length > 8
            )
                throw new Error('projection_phase_report');
            const context = projectionObject(packet.context);
            const common = projectionObject(context.common_process, [
                'pid',
                'worker_pid',
                'identity',
            ]);
            const worker = projectionObject(
                commandRecords[0]?.value?.observation?.process_identity,
                ['schema_version', 'worker_pid', 'child_pid', 'executable'],
            );
            if (
                worker.schema_version !== 1 ||
                !Number.isSafeInteger(worker.worker_pid) ||
                worker.worker_pid < 2 ||
                !Number.isSafeInteger(worker.child_pid) ||
                worker.child_pid < 2 ||
                worker.executable !== '/pilot/runtime-bin/node' ||
                common.pid !== worker.child_pid ||
                common.worker_pid !== worker.worker_pid
            )
                throw new Error('projection_common_worker_identity');
            const commonIdentity = registrationValidator.childIdentity(
                nativeJson(common.identity, 'process').value,
                '/pilot/runtime-bin/node',
                worker.worker_pid,
            );
            if (!commonIdentity || commonIdentity.pid !== worker.child_pid)
                throw new Error('projection_common_identity');
            for (const value of packet.snapshots) {
                projectionObject(value, ['role', 'path', 'bytes', 'sha256']);
                if (value.role === 'state-bytes') {
                    readNative(value, 'state');
                    continue;
                }
                const rawFile = nativeJson(
                    value,
                    value.role.startsWith('state-') ? 'state' : 'inventory',
                );
                snapshots.push({ role: value.role, path: value.path, ...rawFile });
            }
            for (const call of packet.processes) {
                projectionObject(call, [
                    'label',
                    'executable',
                    'argv',
                    'process',
                    'pid',
                    'start_ticks',
                    'stdout',
                    'stderr',
                    'identity',
                ]);
                const stdout = readNative(call.stdout, 'native-log').data;
                const stderr = readNative(call.stderr, 'native-log').data;
                const identity = registrationValidator.childIdentity(
                    nativeJson(call.identity, 'process').value,
                    call.executable,
                    commonIdentity.pid,
                );
                if (
                    identity &&
                    (identity.pid !== call.pid || identity.start_ticks !== call.start_ticks)
                )
                    throw new Error('projection_native_child_identity');
                if (identity) identities.set(call.label, identity);
                registrationRecords.push({
                    label: call.label,
                    executable: call.executable,
                    argv: call.argv,
                    process: call.process,
                    pid: identity?.pid ?? null,
                    start_ticks: identity?.start_ticks ?? null,
                    stdout,
                    stderr,
                });
            }
            const calls = new NativePilotCommonPhaseService().calls(
                { ...selection, phase: step.id, pin: step.pin },
                this.prepared.contract,
            );
            if (
                packet.processes.length > calls.length ||
                packet.processes.some(
                    (call: any, index: number) =>
                        call.label !== calls[index].label ||
                        call.executable !== calls[index].executable ||
                        JSON.stringify(call.argv) !== JSON.stringify(calls[index].argv),
                )
            )
                throw new Error('projection_fixed_call');
        }
        if (step.id === 'baseline' || step.id === 'verify-absent') {
            const registration = registrationValidator.validate(
                selection.host,
                step.id,
                registrationRecords.slice(0, 3),
            );
            satisfied.set('unauthenticated', registration.unauthenticated);
            satisfied.set(
                'owned-plugin-and-marketplace-absent',
                registration.owned_plugin_and_marketplace_absent,
            );
            satisfied.set('fresh-native-process', registration.fresh_native_process);
            // Registry absence does not establish absence of native hooks or MCP servers.
            satisfied.set('owned-hooks-and-mcp-absent', registration.owned_hooks_and_mcp_absent);
        }
        if (step.id === 'preflight') {
            if (!probe || !facts.container_id || !/^[a-f0-9]{64}$/.test(facts.container_id))
                throw new Error('projection_preflight_measurement');
            const home = retained
                .flatMap((row) => (Array.isArray(row.value) ? row.value : []))
                .find((value) => value?.Labels?.['i9.pilot.role'] === 'home');
            if (
                !home ||
                home.Name !== `i9-pilot-${probe.nonce}-home` ||
                home.Labels?.['i9.pilot.run'] !== selection.run_id ||
                home.Labels?.['i9.pilot.host'] !== selection.host ||
                home.Labels?.['i9.pilot.repetition'] !== String(selection.repetition) ||
                home.Labels?.['i9.pilot.nonce'] !== probe.nonce
            )
                throw new Error('projection_owned_home_instance');
            this.profile = projectionDigest(
                JSON.stringify({ volume: home.Name, nonce: probe.nonce, home: probe.passwd_home }),
            );
            this.prior.set('probe', probe);
            environment = {
                instance_sha256: projectionDigest(facts.container_id),
                profile_sha256: this.profile,
            };
            satisfied.set(
                'fresh-disposable-account',
                probe.uid === 1000 && probe.gid === 1000 && probe.passwd_name === 'node',
            );
            satisfied.set(
                'normal-home-unchanged',
                probe.home === probe.passwd_home &&
                    probe.home === NativePilotConfiguration.accountHome,
            );
            satisfied.set(
                'no-home-overrides',
                Array.isArray(probe.environment) &&
                    probe.environment.includes(`HOME=${probe.passwd_home}`) &&
                    !probe.environment.some((value: string) => value.startsWith('CODEX_HOME=')),
            );
            satisfied.set(
                'no-credentials',
                Array.isArray(probe.credential_paths) && probe.credential_paths.length === 0,
            );
            satisfied.set(
                'input-and-binary-pins-match',
                ['source_a', 'source_b', 'driver', 'observer'].every(
                    (key) => probe.hashes?.[key] === (this.prepared.trees as any)[key].tree_sha256,
                ) &&
                    ['node', 'codex', 'claude'].every(
                        (key) =>
                            probe.hashes?.[key] ===
                            (this.prepared.contract.binaries as any)[key].sha256,
                    ),
            );
            satisfied.set(
                'measured-network-isolation',
                JSON.stringify(probe.interfaces) === '["lo"]' &&
                    probe.routes?.length === 0 &&
                    probe.external_connect === 'ENETUNREACH',
            );
            const denied = (paths: string[]) =>
                paths.every((path) =>
                    probe.denied?.some((row: any) => row.path === path && row.error === 'EROFS'),
                );
            satisfied.set(
                'measured-readonly-source-consumer-runtime',
                denied([
                    '/pilot/input',
                    '/pilot/source',
                    '/pilot/runtime-bin',
                    '/pilot/consumer',
                    '/pilot/control',
                ]),
            );
            satisfied.set('measured-outside-write-denial', denied(['/var/tmp']));
            satisfied.set(
                'measured-owned-writes',
                [
                    NativePilotConfiguration.accountHome,
                    '/pilot/state',
                    '/pilot/work',
                    '/pilot/native-output',
                    '/tmp',
                ].every((path) =>
                    probe.writable?.some(
                        (row: any) =>
                            row.path === path && row.created === true && row.removed === true,
                    ),
                ),
            );
            satisfied.set(
                'privileged-sockets-inaccessible',
                probe.sockets?.length === 4 &&
                    probe.sockets.every((row: any) => row.present === false),
            );
            satisfied.set(
                'controller-and-native-permissions-separated',
                probe.no_new_privileges === 1 &&
                    probe.seccomp === 2 &&
                    ['effective', 'permitted', 'bounding'].every((key) =>
                        /^0+$/.test(probe.capabilities?.[key] ?? ''),
                    ),
            );
            const versions = packet?.processes;
            const versionText = (index: number) =>
                versions?.[index]
                    ? new TextDecoder('utf-8', { fatal: true })
                          .decode(this.files.decode(nativeFiles!.get(versions[index].stdout.path)!))
                          .replace(/\r?\n$/, '')
                    : null;
            const exact =
                versions?.length === 2 &&
                versions.every((call: any) => goodProcess(call.process)) &&
                versionText(0) === `v${this.prepared.contract.binaries.node.version}` &&
                versionText(1) ===
                    (selection.host === 'codex'
                        ? `codex-cli ${this.prepared.contract.binaries.codex.version}`
                        : `${this.prepared.contract.binaries.claude.version} (Claude Code)`);
            satisfied.set('exact-native-and-node-versions', !!exact);
            // This is selected adapter support, not a claim that later native responses conform.
            satisfied.set(
                'approved-native-schema',
                !!exact &&
                    (selection.host === 'codex'
                        ? this.prepared.contract.binaries.codex.version === '0.160.0'
                        : this.prepared.contract.binaries.claude.version === '2.1.285'),
            );
        }
        const role = (name: string) => snapshots.filter((value) => value.role === name);
        const states = snapshots.filter((value) =>
            ['state-baseline', 'state-observation', 'state-stop'].includes(value.role),
        );
        for (const entry of states) this.state(entry.value, entry.path, nativeFiles);
        const settings = role('unrelated-settings');
        const data = role('unrelated-data');
        for (const entry of [...settings, ...data]) this.rawWitness(entry.value);
        const sourceSnapshots = role('source-inventory');
        const consumers = role('consumer-inventory');
        satisfied.set(
            'source-and-consumer-unchanged',
            sourceSnapshots.length === 2 &&
                sourceSnapshots.every(
                    (item) => JSON.stringify(item.value) === JSON.stringify(source),
                ) &&
                consumers.length === 2 &&
                JSON.stringify(consumers[0].value) === JSON.stringify(consumers[1].value) &&
                (!this.prior.has('consumer') ||
                    JSON.stringify(consumers[0].value) ===
                        JSON.stringify(this.prior.get('consumer'))),
        );
        if (consumers.length === 2 && !this.prior.has('consumer'))
            this.prior.set('consumer', consumers[0].value);
        if (step.id === 'baseline') {
            const witnesses =
                settings.length === 2 &&
                data.length === 2 &&
                settings.every((value) => this.settingsWitness(value.value, selection.host)) &&
                data.every((value) => this.dataWitness(value.value, selection.run_id));
            satisfied.set('unrelated-settings-and-file-sentinels-recorded', witnesses);
            satisfied.set(
                'state-baseline-recorded',
                states.length === 2 &&
                    states.every(
                        (value) => value.value.exists && value.value.status === 'captured',
                    ) &&
                    this.stateEqual(states[0]?.value, states[1]?.value),
            );
            if (
                witnesses &&
                states.length === 2 &&
                states.every((value) => value.value.status === 'captured')
            ) {
                this.prior.set('baseline-state', states.at(-1)!.value);
                this.prior.set('baseline-data', data.at(-1)!.value);
                this.baselineReceipts = packet.snapshots.map((value: any) => ({
                    path: value.path,
                    bytes: value.bytes,
                    sha256: value.sha256,
                }));
            }
        }
        satisfied.set(
            'unrelated-data-preserved',
            this.prior.has('baseline-data') &&
                settings.length === 2 &&
                settings.every((value) => this.settingsWitness(value.value, selection.host)) &&
                data.length === 2 &&
                data.every(
                    (value) =>
                        JSON.stringify(value.value) ===
                        JSON.stringify(this.prior.get('baseline-data')),
                ),
        );
        satisfied.set(
            'prior-state-rows-preserved',
            this.prior.has('baseline-state') &&
                states.length === 2 &&
                states.every((value) =>
                    this.statePreserved(this.prior.get('baseline-state'), value.value),
                ),
        );
        // Outer wrapper snapshots include the SessionStart writer. Only a narrow
        // collector boundary around read-only MCP may establish that gate.
        satisfied.set('read-only-mcp-preserved-state', false);
        satisfied.set(
            'state-closed-and-snapshotted',
            quiescent &&
                states.length === 2 &&
                states.every((value) => value.value.status === 'captured'),
        );
        satisfied.set(
            'snapshots-preserved',
            quiescent &&
                bundle !== null &&
                this.baselineReceipts.length > 0 &&
                this.baselineReceipts.every(
                    (file) =>
                        nativeFiles?.get(file.path)?.sha256 === file.sha256 &&
                        nativeFiles?.get(file.path)?.bytes === file.bytes,
                ),
        );
        let loaded: unknown = null;
        let rollback: unknown = null;
        if (
            selection.host === 'codex' &&
            ['baseline', 'verify-absent', 'observe-a', 'observe-b', 'observe-restored-a'].includes(
                step.id,
            )
        ) {
            const absence = step.id === 'baseline' || step.id === 'verify-absent';
            const call = packet?.processes.find(
                (row: any) =>
                    row.label ===
                    (absence ? 'selected-native-absence-observer' : 'selected-native-observer'),
            );
            if (call && goodProcess(call.process) && identities.has(call.label)) {
                const compact = projectionObject(
                    JSON.parse(
                        new TextDecoder('utf-8', { fatal: true }).decode(
                            readNative(call.stdout, 'native-log').data,
                        ),
                    ),
                    [
                        'schema_version',
                        'runId',
                        'host',
                        'repetition',
                        'phase',
                        'pin',
                        'status',
                        'native_acceptance',
                        'evidence_root',
                        'evidence',
                    ],
                );
                const root =
                    '/pilot/native-output/' +
                    selection.run_id +
                    '-codex-r' +
                    selection.repetition +
                    '-' +
                    step.id;
                if (
                    compact.schema_version !== 1 ||
                    compact.runId !== selection.run_id ||
                    compact.host !== selection.host ||
                    compact.repetition !== selection.repetition ||
                    compact.phase !== step.id ||
                    compact.pin !== step.pin ||
                    compact.native_acceptance !== false ||
                    compact.evidence_root !== root ||
                    !Array.isArray(compact.evidence) ||
                    compact.evidence.length > 32
                )
                    throw new Error('projection_codex_compact');
                const prefix = root.slice('/pilot/native-output/'.length);
                const originals = new Map<
                    string,
                    { data: Buffer; receipt: NativePilotProjectionReceipt; value?: any }
                >();
                for (const file of compact.evidence) {
                    projectionObject(
                        file,
                        file.role === undefined
                            ? ['path', 'bytes', 'sha256']
                            : ['role', 'path', 'bytes', 'sha256'],
                    );
                    if (!projectionPath(file.path)) throw new Error('projection_codex_locator');
                    const path = file.path.startsWith(prefix + '/')
                        ? file.path
                        : prefix + '/' + file.path;
                    if (originals.has(path)) throw new Error('projection_codex_duplicate');
                    originals.set(
                        path,
                        readNative(
                            { ...file, path },
                            file.role?.startsWith('state-') ? 'state' : 'native-log',
                        ),
                    );
                }
                if (!originals.has(prefix + '/input.json')) {
                    const entry = nativeFiles?.get(prefix + '/input.json');
                    if (!entry) throw new Error('projection_codex_missing');
                    originals.set(
                        prefix + '/input.json',
                        readNative(
                            { path: entry.path, bytes: entry.bytes, sha256: entry.sha256 },
                            'inventory',
                        ),
                    );
                }
                const bytes = (name: string) => {
                    const value = originals.get(prefix + '/' + name);
                    if (!value) throw new Error('projection_codex_missing');
                    return value.data;
                };
                const json = (name: string) =>
                    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(name)));
                const key = step.pin === 'b' ? 'source_b' : 'source_a';
                const observerSelection = {
                    runId: selection.run_id,
                    host: selection.host,
                    repetition: selection.repetition,
                    phase: step.id,
                    pin: step.pin,
                };
                const expected = absence
                    ? new NativeCodexObserverDispatcher().absence(
                          observerSelection,
                          this.prepared.contract,
                          source,
                      )
                    : new NativeCodexObserverDispatcher().project(
                          {
                              runId: selection.run_id,
                              host: selection.host,
                              repetition: selection.repetition,
                              phase: step.id,
                              pin: step.pin,
                          },
                          this.prepared.contract,
                          source,
                          this.files.selectedJson(
                              this.prepared.root,
                              key,
                              'skills-catalog.json',
                              source,
                          ),
                          this.files.selectedJson(
                              this.prepared.root,
                              key,
                              'hooks/codex.json',
                              source,
                          ),
                      );
                if (JSON.stringify(json('input.json')) !== JSON.stringify(expected))
                    throw new Error('projection_codex_selected_input');
                const report = json('observation.json');
                const service = new NativePilotCodexObservationService(
                    new NativeCodexProtocolValidator(
                        new NativeCodexSchemaRepository(
                            fileURLToPath(
                                new URL(
                                    '../../assets/native-pilot/codex/schemas/',
                                    import.meta.url,
                                ),
                            ),
                        ),
                    ),
                );
                if (absence) {
                    service.validateAbsence({
                        input: expected as any,
                        report,
                        identity: json('process-identity.json'),
                        events: json('process-events.json'),
                        outer_pid: identities.get(call.label)!.pid,
                        request: bytes('request.jsonl'),
                        stdout: bytes('stdout.jsonl'),
                        stderr: bytes('stderr.log'),
                        fixture_request: bytes('fixture-request.json'),
                        fixture_response: bytes('fixture-response.sse'),
                        fixture_metadata: json('fixture-exchanges.json'),
                    });
                    satisfied.set('owned-hooks-and-mcp-absent', true);
                    satisfied.set('unauthenticated', satisfied.get('unauthenticated') === true);
                    satisfied.set(
                        'fresh-native-process',
                        satisfied.get('fresh-native-process') === true,
                    );
                } else {
                    const innerStates = [];
                    for (const wanted of ['state-before-mcp', 'state-after-mcp']) {
                        const receipts = report.observation?.read_only_mcp?.snapshots;
                        if (!Array.isArray(receipts))
                            throw new Error('projection_mcp_state_missing');
                        const selectedState = receipts.filter((file: any) => file.role === wanted);
                        if (selectedState.length !== 1)
                            throw new Error('projection_mcp_state_missing');
                        const file = selectedState[0];
                        const raw = originals.get(file.path);
                        if (
                            !raw ||
                            raw.data.length !== file.bytes ||
                            projectionDigest(raw.data) !== file.sha256
                        )
                            throw new Error('projection_mcp_state_receipt');
                        const snapshot = JSON.parse(
                            new TextDecoder('utf-8', { fatal: true }).decode(raw.data),
                        );
                        this.state(snapshot, file.path, nativeFiles, receipts);
                        const stem = file.path.replace(/-state\.json$/, '');
                        innerStates.push({
                            snapshot,
                            artifacts: receipts.filter(
                                (row: any) =>
                                    row.path === file.path ||
                                    row.path.startsWith(stem + '-sqlite-copy/'),
                            ),
                        });
                    }
                    const derived = await service.validate({
                        input: expected as any,
                        report,
                        identity: json('process-identity.json'),
                        events: json('process-events.json'),
                        outer_pid: identities.get(call.label)!.pid,
                        request: bytes('request.jsonl'),
                        stdout: bytes('stdout.jsonl'),
                        stderr: bytes('stderr.log'),
                        fixture_request: bytes('fixture-request.json'),
                        fixture_response: bytes('fixture-response.sse'),
                        fixture_metadata: json('fixture-exchanges.json'),
                        home: bundle!.roots.get('home')!,
                        states: innerStates,
                    });
                    const inventory = append(
                        Buffer.from(
                            JSON.stringify({
                                schema_version: 1,
                                source_tree_sha256: source.tree_sha256,
                                installed: derived.installed_artifact_inventory,
                                transformations: derived.transformations,
                                independent_worker_fields: [
                                    'path',
                                    'kind',
                                    'bytes',
                                    'sha256',
                                    'target',
                                ],
                                executable_bits: 'native-adapter-inventory-only',
                            }) + '\n',
                        ),
                        'inventory',
                    );
                    loaded = {
                        process_instance: projectionDigest(
                            JSON.stringify({
                                container: facts.container_id,
                                ...derived.process_identity,
                            }),
                        ),
                        source_tree_sha256: source.tree_sha256,
                        installed_tree_sha256: derived.installed_artifact_tree_sha256,
                        inventory_evidence: inventory.path,
                        transformations: derived.transformations,
                    };
                    for (const id of [
                        'fresh-native-process',
                        'enabled-native-registration',
                        'complete-loaded-skill-inventory',
                        'loaded-source-matches-pin',
                        'native-session-hook-completed',
                        'native-hook-output-observed',
                        'native-mcp-initialized',
                        'exact-hook-trust',
                        'native-mcp-catalog-and-resource',
                        'one-local-response-no-auth-no-tools-no-provider',
                    ])
                        satisfied.set(id, true);
                    satisfied.set(
                        'read-only-mcp-preserved-state',
                        derived.read_only_mcp.branch === 'existing_unchanged' &&
                            this.stateEqual(innerStates[0].snapshot, innerStates[1].snapshot),
                    );
                    if (
                        step.id === 'observe-restored-a' &&
                        states.length === 2 &&
                        this.prior.has('latest-state') &&
                        this.statePreserved(this.prior.get('latest-state'), states[0].value) &&
                        this.statePreserved(states[0].value, states[1].value)
                    ) {
                        rollback = {
                            result: 'compatible',
                            before_sha256: states[0].receipt.sha256,
                            after_sha256: states[1].receipt.sha256,
                            evidence: [states[0].receipt.path, states[1].receipt.path],
                        };
                    }
                    if (states.length === 2 && states[1].value.status === 'captured')
                        this.prior.set('latest-state', states[1].value);
                }
            }
        }
        if (
            selection.host === 'claude' &&
            ['baseline', 'verify-absent', 'observe-a', 'observe-b', 'observe-restored-a'].includes(
                step.id,
            )
        ) {
            const absence = step.id === 'baseline' || step.id === 'verify-absent';
            const label = absence ? 'selected-native-absence-observer' : 'selected-native-observer';
            const call = packet?.processes.find((row: any) => row.label === label);
            const observerIdentity = identities.get(label);
            if (call && goodProcess(call.process) && observerIdentity) {
                const compact = projectionObject(
                    JSON.parse(
                        new TextDecoder('utf-8', { fatal: true }).decode(
                            readNative(call.stdout, 'native-log').data,
                        ),
                    ),
                    [
                        'schema_version',
                        'run_id',
                        'host',
                        'repetition',
                        'phase',
                        'pin',
                        'status',
                        'reason',
                        'native_acceptance',
                        'semantic_status',
                        'evidence_root',
                        'evidence',
                    ],
                );
                const pin = step.pin === 'b' ? 'b' : 'a';
                const selected = {
                    ...selection,
                    host: 'claude' as const,
                    phase: step.id as any,
                    pin: pin as 'a' | 'b',
                };
                const prefix = `${selection.run_id}-claude-r${selection.repetition}-${step.id}-raw`;
                if (
                    compact.schema_version !== 2 ||
                    compact.run_id !== selected.run_id ||
                    compact.host !== 'claude' ||
                    compact.repetition !== selected.repetition ||
                    compact.phase !== selected.phase ||
                    compact.pin !== pin ||
                    compact.status !== 'captured' ||
                    compact.native_acceptance !== false ||
                    compact.evidence_root !== '/pilot/native-output/' + prefix ||
                    !Array.isArray(compact.evidence) ||
                    compact.evidence.length > 96
                )
                    throw new Error('projection_claude_compact');
                const originals = new Map<string, Buffer>();
                for (const file of compact.evidence) {
                    projectionObject(file, ['path', 'bytes', 'sha256']);
                    if (!projectionPath(file.path) || originals.has(file.path))
                        throw new Error('projection_claude_locator');
                    originals.set(
                        file.path,
                        readNative({ ...file, path: prefix + '/' + file.path }, 'native-log').data,
                    );
                }
                const bytes = (name: string) => {
                    const value = originals.get(name);
                    if (!value) throw new Error('projection_claude_missing');
                    return value;
                };
                const json = (name: string) =>
                    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(name)));
                const configuration = new NativeClaudeRawConfiguration();
                const recipe = configuration.commands(
                    this.prepared.contract.mcp.claude[pin],
                    configuration.diagnostic(selected),
                    selected.phase,
                );
                const records: NativeClaudeObservationRecord[] = recipe.map((expected, index) => {
                    const stem = `${String(index + 1).padStart(2, '0')}-${expected.label}`;
                    const command = json(stem + '-request.json');
                    const process = projectionObject(json(stem + '-process.json'), [
                        'label',
                        'status',
                        'exit_code',
                        'signal',
                        'pid',
                        'start_ticks',
                        'identity',
                        'cleanup',
                    ]);
                    if (process.label !== expected.label)
                        throw new Error('projection_claude_call_label');
                    const { label: _label, ...actual } = process;
                    return {
                        command,
                        process: {
                            ...actual,
                            stdout: bytes(stem + '.stdout'),
                            stderr: bytes(stem + '.stderr'),
                        } as any,
                    };
                });
                const context = json('context.json');
                const report = json('observation.json');
                const hashes: Record<string, string> = {
                    source_a: this.prepared.trees.source_a.tree_sha256,
                    source_b: this.prepared.trees.source_b.tree_sha256,
                    driver: this.prepared.trees.driver.tree_sha256,
                    observer: this.prepared.trees.observer.tree_sha256,
                    node: this.prepared.contract.binaries.node.sha256,
                    codex: this.prepared.contract.binaries.codex.sha256,
                    claude: this.prepared.contract.binaries.claude.sha256,
                    source: source.tree_sha256,
                    consumer: consumers[0]?.value.tree_sha256,
                };
                const derived = new NativePilotClaudeObservationService().validate({
                    selection: selected,
                    contract: this.prepared.contract,
                    source,
                    context,
                    report,
                    records,
                    diagnostic: absence ? null : bytes('claude-diagnostic.log'),
                    before: absence ? null : json('source-before.json'),
                    after: absence ? null : json('source-after.json'),
                    inputs_unchanged: satisfied.get('source-and-consumer-unchanged') === true,
                    observer_pid: observerIdentity.pid,
                    observer_start_ticks: observerIdentity.start_ticks,
                    expected_nonce: this.nonce!,
                    expected_inputs: hashes,
                    expected_environment: this.prior.get('probe')?.environment,
                });
                satisfied.set('fresh-native-process', derived.checks.fresh_native_processes);
                if (absence) {
                    satisfied.set('owned-hooks-and-mcp-absent', false);
                } else {
                    if (!derived.loaded) throw new Error('projection_claude_loaded');
                    const inventory = append(
                        Buffer.from(
                            JSON.stringify({
                                schema_version: 1,
                                source_root: '/pilot/source',
                                source_tree_sha256: source.tree_sha256,
                                source_before: json('source-before.json'),
                                source_after: json('source-after.json'),
                                independent_worker_source: sourceSnapshots.map((row) => row.value),
                                native_cache_scope: 'selected-manifest-and-registration-only',
                            }) + '\n',
                        ),
                        'inventory',
                    );
                    loaded = {
                        process_instance: projectionDigest(
                            JSON.stringify({ container: facts.container_id, ...observerIdentity }),
                        ),
                        source_tree_sha256: source.tree_sha256,
                        installed_tree_sha256: source.tree_sha256,
                        inventory_evidence: inventory.path,
                        transformations: [],
                    };
                    satisfied.set(
                        'enabled-native-registration',
                        derived.checks.selected_plugin_enabled,
                    );
                    satisfied.set(
                        'complete-loaded-skill-inventory',
                        derived.checks.loaded_full_package_bytes,
                    );
                    satisfied.set(
                        'loaded-source-matches-pin',
                        derived.loaded.source_tree_sha256 === source.tree_sha256,
                    );
                    satisfied.set(
                        'native-session-hook-completed',
                        derived.checks.session_start_output,
                    );
                    satisfied.set(
                        'native-hook-output-observed',
                        derived.checks.session_start_output,
                    );
                    satisfied.set(
                        'native-mcp-initialized',
                        derived.checks.mcp_initial_health && derived.checks.mcp_clean_stop,
                    );
                    const mcp = projectionObject(json('mcp-state.json'), [
                        'schema_version',
                        'scope',
                        'status',
                        'reason',
                        'preservation',
                        'snapshots',
                    ]);
                    if (
                        JSON.stringify(mcp) !== JSON.stringify(report.mcp_state) ||
                        mcp.schema_version !== 1 ||
                        mcp.scope !== 'native-mcp-health-reads-before-init' ||
                        mcp.status !== 'captured' ||
                        !Array.isArray(mcp.snapshots)
                    )
                        throw new Error('projection_claude_mcp_state');
                    const inner = ['state-before-mcp', 'state-after-mcp'].map((role) => {
                        const selectedFiles = mcp.snapshots.filter(
                            (file: any) => file.role === role,
                        );
                        if (selectedFiles.length !== 1)
                            throw new Error('projection_claude_mcp_state_missing');
                        const file = projectionObject(selectedFiles[0], [
                            'role',
                            'path',
                            'bytes',
                            'sha256',
                        ]);
                        if (
                            file.path !==
                            `${prefix}/${role === 'state-before-mcp' ? 'mcp-before' : 'mcp-after'}-state.json`
                        )
                            throw new Error('projection_claude_mcp_state_locator');
                        const actual = nativeJson(
                            { path: file.path, bytes: file.bytes, sha256: file.sha256 },
                            'state',
                        );
                        this.state(actual.value, file.path, nativeFiles, mcp.snapshots);
                        return actual.value;
                    });
                    for (const file of mcp.snapshots) {
                        projectionObject(file, ['role', 'path', 'bytes', 'sha256']);
                        if (
                            !['state-before-mcp', 'state-after-mcp', 'state-bytes'].includes(
                                file.role,
                            ) ||
                            !file.path.startsWith(prefix + '/')
                        )
                            throw new Error('projection_claude_mcp_state_role');
                        readNative(
                            { path: file.path, bytes: file.bytes, sha256: file.sha256 },
                            'state',
                        );
                    }
                    satisfied.set(
                        'read-only-mcp-preserved-state',
                        inner.every((value) => value.exists) && this.stateEqual(inner[0], inner[1]),
                    );
                    if (
                        step.id === 'observe-restored-a' &&
                        states.length === 2 &&
                        this.prior.has('latest-state') &&
                        this.statePreserved(this.prior.get('latest-state'), states[0].value) &&
                        this.statePreserved(states[0].value, states[1].value)
                    )
                        rollback = {
                            result: 'compatible',
                            before_sha256: states[0].receipt.sha256,
                            after_sha256: states[1].receipt.sha256,
                            evidence: [states[0].receipt.path, states[1].receipt.path],
                        };
                    if (states.length === 2 && states[1].value.status === 'captured')
                        this.prior.set('latest-state', states[1].value);
                }
            }
        }
        if (step.id === 'retain' && bundle) {
            satisfied.set('private-evidence-and-state-retained', true);
            satisfied.set('retention-digest-verified', true);
            this.prior.set('final-retention', checkpoint!.file);
        }
        if (step.id === 'cleanup-owned') {
            const cleanup = retained.find(
                (row) => row.value?.stopped && row.value?.removed_volumes,
            )?.value;
            const receipt = this.prior.get('final-retention');
            if (cleanup && receipt) {
                this.files.read(receipt);
                evidence.push({ ...receipt });
                const exact =
                    cleanup.container_id === facts.container_id &&
                    cleanup.native_acceptance === false &&
                    cleanup.removed_volumes.length === 4 &&
                    new Set(cleanup.removed_volumes).size === 4 &&
                    ['home', 'state', 'work', 'native-output'].every((role) =>
                        cleanup.removed_volumes.includes(`i9-pilot-${this.nonce}-${role}`),
                    ) &&
                    cleanup.stopped?.State?.Running === false;
                satisfied.set(
                    'retention-receipt-rechecked',
                    cleanup.retained.sha256 === receipt.sha256 &&
                        cleanup.retained.bytes === receipt.bytes &&
                        relative(this.files.root, cleanup.retained.path) === receipt.path,
                );
                satisfied.set('only-owned-resources-removed', exact);
                satisfied.set('disposable-profile-destroyed', exact);
                satisfied.set('retained-evidence-still-present', true);
            }
        }
        return {
            schema_version: 2,
            ...selection,
            phase: step.id,
            mode: 'native',
            processes: facts.commands.map((value) => value.process),
            checks: step.checks.map((id) => ({
                id,
                satisfied: satisfied.get(id) === true,
                evidence: evidence.map((value) => value.path),
            })),
            evidence,
            environment,
            rollback_state: rollback,
            loaded,
        };
    }

    private rawWitness(value: any) {
        projectionObject(value, ['path', 'exists', 'bytes', 'sha256', 'base64']);
        if (
            typeof value.path !== 'string' ||
            !value.path.startsWith(`${NativePilotConfiguration.accountHome}/`) ||
            typeof value.exists !== 'boolean'
        )
            throw new Error('projection_witness');
        if (!value.exists) {
            if (value.bytes !== 0 || value.sha256 !== null || value.base64 !== null)
                throw new Error('projection_absent_witness');
            return;
        }
        this.files.decode({ ...value, kind: 'file', target: null });
    }
    private settingsWitness(value: any, host: string) {
        if (!value.exists) return false;
        const bytes = this.files.decode({ ...value, kind: 'file', target: null });
        if (host === 'codex') {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            return (
                text.startsWith(
                    '# i9-native-pilot unrelated settings\nhide_agent_reasoning = true\n',
                ) &&
                text.split('\n').filter((line) => /^\s*hide_agent_reasoning\s*=/.test(line))
                    .length === 1
            );
        }
        const settings = projectionObject(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
        );
        return settings.enabledPlugins?.['fixture-plugin@independent-owner'] === false;
    }
    private dataWitness(value: any, run: string) {
        return (
            value.exists &&
            value.sha256 === projectionDigest(`i9-native-pilot unrelated data\nrun_id=${run}\n`)
        );
    }
    private state(value: any, path: string, files: any, receipts?: any[]) {
        projectionObject(value, [
            'schema_version',
            'exists',
            'files',
            'migrations',
            'schema',
            'tables',
            'state_sha256',
            'status',
            'reason',
        ]);
        if (
            value.schema_version !== 2 ||
            typeof value.exists !== 'boolean' ||
            !Array.isArray(value.files) ||
            !Array.isArray(value.tables) ||
            value.tables.length > 64 ||
            !Array.isArray(value.schema) ||
            !Array.isArray(value.migrations) ||
            !['captured', 'blocked'].includes(value.status)
        )
            throw new Error('projection_state_shape');
        const prefix = path.replace(/-state\.json$/, '-sqlite-copy/');
        if (prefix === path || !(files instanceof Map)) throw new Error('projection_state_locator');
        const exported = [...files.values()].filter((entry: any) => entry.path.startsWith(prefix));
        if (!value.exists) {
            if (
                value.files.length ||
                exported.length ||
                value.tables.length ||
                value.schema.length ||
                value.migrations.length ||
                value.state_sha256 !== projectionDigest('absent')
            )
                throw new Error('projection_state_absence');
            return;
        }
        if (value.state_sha256 !== projectionDigest(JSON.stringify(value.files)))
            throw new Error('projection_state_identity');
        const names = new Set<string>();
        if (
            value.files.length < 1 ||
            value.files.length > 3 ||
            !value.files.some((file: any) => file.name === 'skills-usage.db')
        )
            throw new Error('projection_state_incomplete_files');
        for (const file of value.files) {
            projectionObject(file, ['name', 'bytes', 'sha256']);
            if (
                !/^skills-usage\.db(?:-wal|-shm)?$/.test(file.name) ||
                names.has(file.name) ||
                !Number.isSafeInteger(file.bytes) ||
                file.bytes < 0 ||
                file.bytes > 33_554_432 ||
                !/^[a-f0-9]{64}$/.test(file.sha256)
            )
                throw new Error('projection_state_file');
            names.add(file.name);
            const raw = files.get(prefix + file.name);
            if (!raw || raw.bytes !== file.bytes || raw.sha256 !== file.sha256)
                throw new Error('projection_state_byte_receipt');
            this.files.decode(raw);
        }
        if (
            exported.length !== names.size ||
            exported.some(
                (entry: any) =>
                    entry.kind !== 'file' || !names.has(entry.path.slice(prefix.length)),
            )
        )
            throw new Error('projection_state_incomplete_subtree');
        if (receipts !== undefined) {
            const retained = receipts.filter((file: any) => file.path.startsWith(prefix));
            if (
                retained.length !== names.size ||
                new Set(retained.map((file: any) => file.path)).size !== names.size ||
                retained.some(
                    (file: any) =>
                        file.role !== 'state-bytes' ||
                        !names.has(file.path.slice(prefix.length)) ||
                        file.bytes !== files.get(file.path)?.bytes ||
                        file.sha256 !== files.get(file.path)?.sha256,
                )
            )
                throw new Error('projection_state_incomplete_receipts');
        }
        if (value.status === 'captured')
            new NativePilotStateSchemaValidator().validate(value.migrations, value.schema);
        const tableNames = new Set(value.tables.map((table: any) => table.name));
        if (
            tableNames.size !== value.tables.length ||
            (value.status === 'captured' &&
                (value.schema.filter((entry: any) => entry.type === 'table').length !==
                    tableNames.size ||
                    value.schema.some(
                        (entry: any) => entry.type === 'table' && !tableNames.has(entry.name),
                    )))
        )
            throw new Error('projection_incomplete_state_tables');
        let rows = 0;
        for (const table of value.tables) {
            projectionObject(table, ['name', 'sql_sha256', 'rows']);
            if (
                !Array.isArray(table.rows) ||
                table.rows.some(
                    (row: unknown) => typeof row !== 'string' || !/^[a-f0-9]{64}$/.test(row),
                ) ||
                (rows += table.rows.length) > 100_000 ||
                !value.schema.some(
                    (entry: any) =>
                        entry.type === 'table' &&
                        entry.name === table.name &&
                        entry.sql_sha256 === table.sql_sha256,
                )
            )
                throw new Error('projection_state_rows');
        }
    }
    private stateEqual(a: any, b: any) {
        return (
            a?.status === 'captured' &&
            b?.status === 'captured' &&
            a.exists === b.exists &&
            ['files', 'migrations', 'schema', 'tables', 'state_sha256'].every(
                (key) => JSON.stringify(a[key]) === JSON.stringify(b[key]),
            )
        );
    }
    private statePreserved(a: any, b: any) {
        if (a?.status !== 'captured' || b?.status !== 'captured' || (a.exists && !b.exists))
            return false;
        if (
            !a.schema.every((entry: any) =>
                b.schema.some((current: any) => JSON.stringify(entry) === JSON.stringify(current)),
            )
        )
            return false;
        return a.tables.every((table: any) => {
            const current = b.tables.find(
                (entry: any) => entry.name === table.name && entry.sql_sha256 === table.sql_sha256,
            );
            if (!current) return false;
            const rows = new Map<string, number>();
            for (const row of current.rows) rows.set(row, (rows.get(row) ?? 0) + 1);
            for (const row of table.rows) {
                const count = rows.get(row) ?? 0;
                if (!count) return false;
                rows.set(row, count - 1);
            }
            return true;
        });
    }
}
