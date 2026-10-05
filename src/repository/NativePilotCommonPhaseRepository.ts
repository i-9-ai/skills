// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import {
    closeSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readlinkSync,
    readSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
    NativePilotCommonCall,
    NativePilotCommonSelection,
    NativePilotCommonTransport,
} from '../service/NativePilotCommonPhaseService.ts';
import { NativePilotCommonPhaseService } from '../service/NativePilotCommonPhaseService.ts';
import { NativePilotInventoryRepository, pilotDigest } from './NativePilotInventoryRepository.ts';
import { NativePilotContainerWorkerRepository } from './NativePilotContainerWorkerRepository.ts';
import { NativePilotProcessRepository } from './NativePilotProcessRepository.ts';
import { NativePilotStateSnapshotRepository } from './NativePilotStateSnapshotRepository.ts';
import { requireContainer } from '../validator/NativePilotContainerValidator.ts';
import { NativePilotRegistrationObservationValidator } from '../validator/NativePilotRegistrationObservationValidator.ts';
import type { NativePilotChildIdentity } from '../validator/NativePilotRegistrationObservationValidator.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';

interface ChildReader {
    stat(pid: number): Buffer;
    executable(pid: number): string;
}
const childReader: ChildReader = {
    stat(pid) {
        const fd = openSync(`/proc/${pid}/stat`, 'r');
        try {
            const bytes = Buffer.alloc(4097);
            let used = 0;
            while (used < bytes.length) {
                const count = readSync(fd, bytes, used, bytes.length - used, null);
                if (!count) break;
                used += count;
            }
            return bytes.subarray(0, used);
        } finally {
            closeSync(fd);
        }
    },
    executable: (pid) => readlinkSync(`/proc/${pid}/exe`),
};

/** Native entrypoint only: normal owned Linux account and fixed paths, no environment overrides. */
export class NativePilotCommonPhaseRepository implements NativePilotCommonTransport {
    readonly inventory = new NativePilotInventoryRepository();
    readonly worker: NativePilotContainerWorkerRepository;
    readonly execute: typeof spawn;
    readonly child: ChildReader;
    readonly elapsed: () => number;
    private selection!: NativePilotCommonSelection;
    private output!: string;
    private prefix!: string;
    private state!: NativePilotStateSnapshotRepository;
    private home!: string;
    private calls = 0;
    constructor(
        worker: NativePilotContainerWorkerRepository,
        execute: typeof spawn = spawn,
        child: ChildReader = childReader,
        elapsed: () => number = () => performance.now(),
    ) {
        this.worker = worker;
        this.execute = execute;
        this.child = child;
        // Node's monotonic process age includes entrypoint imports and setup. A phase is one
        // fresh common process; constructing a repository never grants a new phase window.
        this.elapsed = elapsed;
    }

    context(selection: NativePilotCommonSelection) {
        const actual = this.worker.context();
        requireContainer(
            JSON.stringify(this.worker.request.selection) ===
                JSON.stringify({
                    run_id: selection.run_id,
                    host: selection.host,
                    repetition: selection.repetition,
                }),
            'Common selection differs.',
        );
        this.selection = selection;
        this.home = actual.account.home;
        this.prefix = `common-${selection.run_id}-${selection.host}-${selection.repetition}-${selection.phase}`;
        this.inventory.canonicalDirectory('/pilot/native-output');
        this.output = join('/pilot/native-output', this.prefix);
        mkdirSync(this.output, { mode: 0o700 });
        this.state = new NativePilotStateSnapshotRepository({
            home: actual.account.home,
            outputRoot: this.output,
        });
        return {
            contract: this.worker.request.contract,
            evidence: {
                ...actual,
                common_process: this.commonProcess(),
                native_acceptance: false,
            },
        };
    }

    private commonProcess() {
        const self = this.measureIdentity(process.pid, process.ppid, '/pilot/runtime-bin/node');
        const identity = this.json('common-process-identity', self);
        requireContainer(self.status === 'observed', 'Common process identity is unavailable.');
        return { pid: process.pid, worker_pid: process.ppid, identity };
    }

    private measureIdentity(pid: number | null, parentPid: number, executable: string) {
        const codec = new NativePilotRegistrationObservationValidator();
        const identity: NativePilotChildIdentity = {
            schema_version: 2,
            status: 'unavailable',
            pid,
            observer_pid: parentPid,
            start_ticks: null,
            executable: null,
            stat_before: null,
            stat_after: null,
        };
        if (!Number.isSafeInteger(pid) || pid! < 2) return identity;
        try {
            const before = this.child.stat(pid!);
            identity.stat_before = codec.childStatReceipt(before);
            const actualExecutable = this.child.executable(pid!);
            identity.executable = actualExecutable.length <= 1024 ? actualExecutable : null;
            identity.stat_after = codec.childStatReceipt(this.child.stat(pid!));
            const first = codec.childStat(before, pid!, parentPid);
            const candidate = {
                ...identity,
                status: 'observed' as const,
                start_ticks: first?.start_ticks ?? null,
            };
            if (codec.childIdentity(candidate, executable, parentPid)) return candidate;
            identity.status = 'invalid';
        } catch {
            // Disappearance or unreadable/over-bound samples remain unobserved. Any complete
            // sample already read is retained without inventing a successful second sample.
        }
        return identity;
    }

    private present(path: string) {
        try {
            lstatSync(path);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
            throw error;
        }
    }
    private retain(name: string, data: Uint8Array) {
        requireContainer(
            /^[a-z0-9-]+\.(?:json|stdout|stderr)$/.test(name) && data.length <= 8_388_608,
            'Common evidence bound.',
        );
        const path = join(this.output, name);
        writeFileSync(path, data, { flag: 'wx', mode: 0o600 });
        const measured = this.inventory.file(path, 8_388_608);
        requireContainer(
            measured.sha256 === pilotDigest(Buffer.from(data)),
            'Common retained bytes changed.',
        );
        return { path: `${this.prefix}/${name}`, bytes: measured.bytes, sha256: measured.sha256 };
    }
    private json(name: string, value: unknown) {
        return this.retain(`${name}.json`, Buffer.from(JSON.stringify(value) + '\n'));
    }
    private settingsPath() {
        return this.selection.host === 'codex'
            ? join(this.home, '.codex', 'config.toml')
            : join(this.home, '.claude', 'settings.json');
    }
    private rawFile(path: string) {
        this.inventory.canonicalDirectory(dirname(path));
        if (!this.present(path))
            return { path, exists: false, bytes: 0, sha256: null, base64: null };
        const before = this.inventory.file(path, 1_048_576);
        const bytes = readFileSync(path);
        const after = this.inventory.file(path, 1_048_576);
        requireContainer(
            JSON.stringify(before) === JSON.stringify(after) &&
                pilotDigest(bytes) === before.sha256,
            'Settings changed while reading.',
        );
        return {
            path,
            exists: true,
            bytes: bytes.length,
            sha256: before.sha256,
            base64: bytes.toString('base64'),
        };
    }

    seed() {
        requireContainer(this.selection.phase === 'baseline', 'Seed is baseline-only.');
        const settings = this.settingsPath();
        if (!this.present(dirname(settings))) mkdirSync(dirname(settings), { mode: 0o700 });
        this.inventory.canonicalDirectory(dirname(settings));
        requireContainer(
            !this.present(settings) &&
                !this.present(join(this.home, '.i9-native-pilot-unrelated.txt')),
            'Baseline cannot overwrite existing witnesses.',
        );
        writeFileSync(
            settings,
            this.selection.host === 'codex'
                ? '# i9-native-pilot unrelated settings\nhide_agent_reasoning = true\n'
                : JSON.stringify({
                      enabledPlugins: { 'fixture-plugin@independent-owner': false },
                  }) + '\n',
            { flag: 'wx', mode: 0o600 },
        );
        writeFileSync(
            join(this.home, '.i9-native-pilot-unrelated.txt'),
            `i9-native-pilot unrelated data\nrun_id=${this.selection.run_id}\n`,
            { flag: 'wx', mode: 0o600 },
        );
        this.state.seed(this.selection.run_id);
    }

    snapshot(label: string) {
        requireContainer(['before', 'after'].includes(label), 'Unknown common snapshot.');
        this.worker.context();
        const phase = this.selection.phase;
        const stateRole =
            phase === 'baseline'
                ? 'state-baseline'
                : phase.startsWith('stop-')
                  ? 'state-stop'
                  : 'state-observation';
        this.state.snapshot(label);
        const evidence = this.state.artifacts(label).map((file) => ({
            role: file.path.endsWith('-state.json') ? stateRole : 'state-bytes',
            path: `${this.prefix}/${file.path}`,
            bytes: file.bytes,
            sha256: file.sha256,
        }));
        // Preflight has no settings directories or sentinels yet; absence is retained explicitly.
        const settings = this.settingsPath();
        const rawSettings = this.present(dirname(settings))
            ? this.rawFile(settings)
            : { path: settings, exists: false, bytes: 0, sha256: null, base64: null };
        evidence.push({
            role: 'unrelated-settings',
            ...this.json(`${label}-unrelated-settings`, rawSettings),
        });
        evidence.push({
            role: 'unrelated-data',
            ...this.json(
                `${label}-unrelated-data`,
                this.rawFile(join(this.home, '.i9-native-pilot-unrelated.txt')),
            ),
        });
        for (const role of ['source', 'consumer'])
            evidence.push({
                role: `${role}-inventory`,
                ...this.json(`${label}-${role}-inventory`, this.inventory.tree(`/pilot/${role}`)),
            });
        if (this.selection.host === 'claude')
            evidence.push({
                role: 'plugin-data',
                ...this.json(`${label}-plugin-data`, {
                    status: 'unsupported',
                    reason: 'native-plugin-data-root-not-yet-bound-to-observed-host-contract',
                }),
            });
        return evidence;
    }

    async run(call: NativePilotCommonCall) {
        this.worker.context();
        const recipe = new NativePilotCommonPhaseService().calls(
            this.selection,
            this.worker.request.contract,
        );
        requireContainer(
            JSON.stringify(call) === JSON.stringify(recipe[this.calls]),
            'Common call order differs.',
        );
        this.calls++;
        const npm = this.worker.nativeEnvironment();
        let identity: NativePilotChildIdentity = {
            schema_version: 2,
            status: 'unavailable',
            pid: null,
            observer_pid: process.pid,
            start_ticks: null,
            executable: null,
            stat_before: null,
            stat_after: null,
        };
        // Recompute after context hashing and offline environment preparation, immediately
        // before dispatch. The externally enforced phase limit is never extended.
        const budget = NativePilotConfiguration.observationBudget(call.label, this.elapsed());
        let dispatched = false;
        const raw = await new Promise<{
            status: number | null;
            signal: string | null;
            error?: { code: string };
            stdout: Buffer;
            stderr: Buffer;
        }>((resolve) => {
            const output = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
            let size = 0;
            let failure: string | undefined;
            let done = false;
            let deadline: ReturnType<typeof setTimeout> | undefined;
            let rescue: ReturnType<typeof setTimeout> | undefined;
            let child: ReturnType<typeof spawn>;
            const finish = (status: number | null, signal: string | null) => {
                if (done) return;
                done = true;
                clearTimeout(deadline);
                clearTimeout(rescue);
                resolve({
                    status,
                    signal,
                    ...(failure ? { error: { code: failure } } : {}),
                    stdout: Buffer.concat(output.stdout),
                    stderr: Buffer.concat(output.stderr),
                });
            };
            const stop = () => {
                // This handle owns only the child we started; the outer controller audits and
                // stops the whole owned container if descendants or exit state are unknown.
                try {
                    child.kill('SIGKILL');
                } catch {
                    /* Unknown exit stays a blocked process. */
                }
                rescue ??= setTimeout(
                    () => finish(null, null),
                    NativePilotConfiguration.observation.child_rescue_ms,
                );
            };
            const capture = (stream: 'stdout' | 'stderr', value: Buffer) => {
                if (done) return;
                const bytes = Buffer.from(value);
                const retained = bytes.subarray(0, Math.max(0, 1_048_576 - size));
                output[stream].push(retained);
                size += retained.length;
                if (retained.length !== bytes.length && failure !== 'ENOBUFS') {
                    failure = 'ENOBUFS';
                    stop();
                }
            };
            if (budget.timeout_ms === 0) {
                failure = 'ETIMEDOUT';
                finish(null, null);
                return;
            }
            try {
                dispatched = true;
                child = this.execute(call.executable, call.argv, {
                    cwd: '/pilot/consumer',
                    shell: false,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    ...(npm.environment ? { env: npm.environment } : {}),
                });
                child.stdout?.on('data', (bytes: Buffer) => capture('stdout', bytes));
                child.stderr?.on('data', (bytes: Buffer) => capture('stderr', bytes));
                child.once('spawn', () => {
                    if (done) return;
                    const pid = child.pid;
                    if (!Number.isSafeInteger(pid) || pid! < 2) return;
                    identity = this.measureIdentity(pid!, process.pid, call.executable);
                });
                child.once('error', (error: NodeJS.ErrnoException) => {
                    failure = ['ENOENT', 'EACCES'].includes(error.code ?? '')
                        ? error.code
                        : 'ECHILD';
                    if (!child.pid) finish(null, null);
                    else stop();
                });
                child.once('close', (status, signal) => finish(status, signal));
                deadline = setTimeout(
                    () => {
                        if (!failure) failure = 'ETIMEDOUT';
                        stop();
                    },
                    Math.max(
                        0,
                        budget.timeout_ms - Math.max(0, this.elapsed() - budget.elapsed_ms!),
                    ),
                );
            } catch {
                failure = 'ECHILD';
                finish(null, null);
            }
        });
        const stdout = raw.stdout;
        const stderr = raw.stderr;
        this.json(`${this.calls}-${call.label}-budget`, {
            schema_version: 1,
            ...budget,
            dispatched,
            reason: budget.timeout_ms === 0 ? 'insufficient-remaining-phase-budget' : null,
        });
        const over = raw.error?.code === 'ENOBUFS';
        const result = new NativePilotProcessRepository().run(
            { executable: call.executable, args: call.argv, timeout_ms: 1 },
            '/pilot/consumer',
            () => ({
                status: raw.status,
                signal: raw.signal,
                error: over
                    ? { code: 'ENOBUFS' }
                    : raw.error
                      ? { code: raw.error.code }
                      : undefined,
                stdout: '',
                stderr: '',
            }),
        );
        let text: string | null = null;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
        } catch {
            /* Raw bytes retained; codec remains blocked. */
        }
        const out = this.retain(
            `${this.calls}-${call.label}.stdout`,
            stdout.subarray(0, 1_048_576),
        );
        const err = this.retain(
            `${this.calls}-${call.label}.stderr`,
            stderr.subarray(0, Math.max(0, 1_048_576 - out.bytes)),
        );
        return {
            process: result.process,
            pid: identity.pid,
            start_ticks: identity.start_ticks,
            identity: this.json(`${this.calls}-${call.label}-identity`, identity),
            stdout: out,
            stderr: err,
            text: over ? null : text,
        };
    }

    finish(value: unknown) {
        this.worker.context();
        const report = this.json('phase', value);
        return {
            schema_version: 2,
            kind: 'native-common-phase-receipt',
            native_acceptance: false,
            phase: this.selection.phase,
            selection: this.worker.request.selection,
            report,
        };
    }
}
