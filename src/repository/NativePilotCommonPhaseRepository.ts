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
    ) {
        this.worker = worker;
        this.execute = execute;
        this.child = child;
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
            evidence: { ...actual, native_acceptance: false },
        };
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
        const codec = new NativePilotRegistrationObservationValidator();
        const identity: {
            schema_version: 1;
            status: 'observed' | 'unavailable' | 'invalid';
            pid: number | null;
            start_ticks: string | null;
            executable: string | null;
            stat: { bytes: number; sha256: string; base64: string } | null;
        } = {
            schema_version: 1,
            status: 'unavailable',
            pid: null,
            start_ticks: null,
            executable: null,
            stat: null,
        };
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
                rescue ??= setTimeout(() => finish(null, null), 1000);
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
            try {
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
                    identity.pid = pid!;
                    try {
                        const bytes = this.child.stat(pid!);
                        identity.stat = {
                            bytes: bytes.length,
                            sha256: pilotDigest(bytes),
                            base64: bytes.toString('base64'),
                        };
                        const first = codec.childStat(bytes, pid!);
                        const executable = this.child.executable(pid!);
                        identity.executable = executable.length <= 1024 ? executable : null;
                        const after = codec.childStat(this.child.stat(pid!), pid!);
                        if (
                            first &&
                            after?.start_ticks === first.start_ticks &&
                            executable === call.executable
                        ) {
                            identity.status = 'observed';
                            identity.start_ticks = first.start_ticks;
                        } else identity.status = 'invalid';
                    } catch {
                        /* A fast exit or unreadable proc entry is retained as unavailable. */
                    }
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
                    call.label === 'selected-native-observer' ? 40_000 : 12_000,
                );
            } catch {
                failure = 'ECHILD';
                finish(null, null);
            }
        });
        const stdout = raw.stdout;
        const stderr = raw.stderr;
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
