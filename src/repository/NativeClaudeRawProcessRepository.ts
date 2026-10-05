// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { NativeClaudeRawConfiguration } from '../config/NativeClaudeRawConfiguration.ts';
import type {
    NativeClaudeRawCommand,
    NativeClaudeRawSelection,
} from '../config/NativeClaudeRawConfiguration.ts';
import {
    NativePilotContractValidator,
    closedObject,
} from '../validator/NativePilotContractValidator.ts';
import { NativePilotInventoryRepository } from './NativePilotInventoryRepository.ts';
import { NativeClaudeRawArtifactRepository } from './NativeClaudeRawArtifactRepository.ts';
import type { NativePilotContract } from '../config/NativePilotConfiguration.ts';
import { NativePilotNpmEnvironmentRepository } from './NativePilotNpmEnvironmentRepository.ts';
import { NativeClaudeProcessIdentityValidator } from '../validator/NativeClaudeProcessIdentityValidator.ts';
import type { NativeClaudeChildIdentity } from '../validator/NativeClaudeProcessIdentityValidator.ts';
export type { NativeClaudeChildIdentity } from '../validator/NativeClaudeProcessIdentityValidator.ts';
import { pilotDigest } from './NativePilotInventoryRepository.ts';
import type { NativePilotInventory } from './NativePilotInventoryRepository.ts';

export interface NativeClaudeSourceSnapshot {
    schema_version: 1;
    pin: 'a' | 'b';
    source_root: '/pilot/source';
    selected_inventory: NativePilotInventory;
    actual_inventory: NativePilotInventory;
    plugin_manifest: { bytes: number; sha256: string; base64: string };
    mcp_manifest: { bytes: number; sha256: string; base64: string };
    hook_manifest: { bytes: number; sha256: string; base64: string };
}

export interface NativeClaudeRawProcess {
    status: 'completed' | 'timeout' | 'output-limit' | 'unavailable' | 'execution-error';
    exit_code: number | null;
    signal: string | null;
    pid: number | null;
    start_ticks: string | null;
    identity: NativeClaudeChildIdentity;
    stdout: Uint8Array;
    stderr: Uint8Array;
    cleanup: 'group-absent' | 'unverified';
}
export interface NativeClaudeRawContext {
    schema_version: 1;
    mode: 'native' | 'synthetic';
    contract: NativePilotContract;
    nonce: string;
    selection: NativeClaudeRawSelection;
    account: { name: string; uid: number; gid: number; home: string };
    environment: string[];
    platform: string;
    observer_pid: number;
    observer_start_ticks: string | null;
    no_new_privileges: string | null;
    seccomp: string | null;
    capabilities: Record<string, string | null>;
    routes: string[];
    inputs: Record<string, string>;
    evidence_scope: 'context-measurement-only';
}
export interface NativeClaudeRawTransport {
    context(selection: NativeClaudeRawSelection): Promise<NativeClaudeRawContext>;
    run(command: NativeClaudeRawCommand): Promise<NativeClaudeRawProcess>;
    snapshot(context: NativeClaudeRawContext): Promise<NativeClaudeSourceSnapshot>;
    recheck(context: NativeClaudeRawContext): Promise<boolean>;
}

/** Fixed Linux disposable-lane transport. No host discovery, profile override, shell or forwarding. */
export class NativeClaudeRawProcessRepository implements NativeClaudeRawTransport {
    static readonly normalHome = join('/', 'home', 'node');
    private readonly files = new NativeClaudeRawArtifactRepository();
    private readonly inventory = new NativePilotInventoryRepository();
    private contextValue: NativeClaudeRawContext | null = null;
    private recipe: NativeClaudeRawCommand[] = [];
    private readonly child: { stat(pid: number): Buffer; executable(pid: number): string };

    constructor(
        options: { child?: { stat(pid: number): Buffer; executable(pid: number): string } } = {},
    ) {
        this.child = options.child ?? {
            stat: (pid) => readFileSync(`/proc/${pid}/stat`),
            executable: (pid) => readlinkSync(`/proc/${pid}/exe`),
        };
    }

    private captureChildIdentity(
        pid: number | null,
        observerPid: number,
    ): NativeClaudeChildIdentity {
        const identity: NativeClaudeChildIdentity = {
            schema_version: 2,
            status: 'unavailable',
            pid,
            observer_pid: observerPid,
            start_ticks: null,
            executable: null,
            stat_before: null,
            stat_after: null,
        };
        if (
            !Number.isSafeInteger(pid) ||
            pid! < 2 ||
            !Number.isSafeInteger(observerPid) ||
            observerPid < 2 ||
            pid === observerPid
        )
            return { ...identity, status: 'invalid' };
        const codec = new NativeClaudeProcessIdentityValidator();
        try {
            identity.stat_before = codec.receipt(this.child.stat(pid!));
            const executable = this.child.executable(pid!);
            identity.executable = executable.length <= 1024 ? executable : null;
            identity.stat_after = codec.receipt(this.child.stat(pid!));
            return codec.observed(identity);
        } catch {
            // A fast exit or unreadable second sample retains what was seen without proving ownership.
            return identity;
        }
    }

    /** Pure check of the inherited measured environment; this never assigns or drops variables. */
    static validateEnvironment(
        environment: NodeJS.ProcessEnv,
        measuredHostname: string,
        nodeVersion: string,
    ): void {
        const allowed = [
            'HOME',
            'PATH',
            'LANG',
            'HOSTNAME',
            'NODE_VERSION',
            'YARN_VERSION',
            ...Object.keys(NativePilotNpmEnvironmentRepository.additions),
        ];
        if (
            Object.keys(environment).some((key) => !allowed.includes(key)) ||
            environment.HOME !== NativeClaudeRawProcessRepository.normalHome ||
            environment.PATH !== NativeClaudeRawConfiguration.path ||
            (environment.LANG !== undefined && environment.LANG !== 'C.UTF-8') ||
            (environment.HOSTNAME !== undefined && environment.HOSTNAME !== measuredHostname) ||
            ['NODE_VERSION', 'YARN_VERSION'].some(
                (key) =>
                    environment[key] !== undefined && !/^\d+\.\d+\.\d+$/.test(environment[key]!),
            ) ||
            (environment.NODE_VERSION !== undefined && environment.NODE_VERSION !== nodeVersion)
        )
            throw new Error('raw_environment');
        try {
            NativePilotNpmEnvironmentRepository.environment(environment, true);
        } catch {
            throw new Error('raw_environment');
        }
    }

    private startTicks(pid: number): string | null {
        try {
            const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
            const ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
            return /^[0-9]{1,32}$/.test(ticks) ? ticks : null;
        } catch {
            return null;
        }
    }

    private hashes(expected: Record<string, string>): Record<string, string> {
        const result: Record<string, string> = {};
        for (const key of Object.keys(expected)) {
            const binary = ['node', 'codex', 'claude'].includes(key);
            const path = binary
                ? `/pilot/runtime-bin/${key}`
                : ['source', 'consumer'].includes(key)
                  ? `/pilot/${key}`
                  : `/pilot/input/${key}`;
            result[key] = binary
                ? this.inventory.file(path, 536_870_912).sha256
                : this.inventory.tree(path).tree_sha256;
            if (result[key] !== expected[key]) throw new Error('raw_input_changed');
        }
        return result;
    }

    async context(selection: NativeClaudeRawSelection): Promise<NativeClaudeRawContext> {
        const contract = new NativePilotContractValidator().resolved(
            this.files.json('/pilot/contract.json'),
        );
        const request = closedObject(
            this.files.json('/pilot/control/worker.json'),
            ['schema_version', 'contract', 'selection', 'account', 'nonce', 'expected'],
            'worker',
        );
        const account = closedObject(
            request.account,
            ['name', 'uid', 'gid', 'home', 'seed_sha256'],
            'account',
        );
        const expected = closedObject(
            request.expected,
            [
                'source_a',
                'source_b',
                'driver',
                'observer',
                'node',
                'codex',
                'claude',
                'source',
                'consumer',
            ],
            'expected',
        );
        const actual = userInfo();
        const selected = {
            run_id: selection.run_id,
            host: selection.host,
            repetition: selection.repetition,
        };
        if (
            request.schema_version !== 1 ||
            !/^[a-f0-9]{32}$/.test(String(request.nonce)) ||
            JSON.stringify(request.contract) !== JSON.stringify(contract) ||
            JSON.stringify(request.selection) !== JSON.stringify(selected) ||
            account.name !== 'node' ||
            account.uid !== 1000 ||
            account.gid !== 1000 ||
            account.home !== NativeClaudeRawProcessRepository.normalHome ||
            !/^[a-f0-9]{64}$/.test(String(account.seed_sha256)) ||
            Object.values(expected).some(
                (value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value),
            ) ||
            contract.authority.platform !== 'linux/arm64' ||
            contract.binaries.claude.version !== '2.1.285' ||
            process.platform !== 'linux' ||
            process.arch !== 'arm64' ||
            process.execPath !== '/pilot/runtime-bin/node' ||
            process.versions.node !== contract.binaries.node.version ||
            actual.username !== account.name ||
            actual.uid !== account.uid ||
            actual.gid !== account.gid ||
            actual.homedir !== account.home ||
            process.env.HOME !== actual.homedir ||
            process.getuid?.() !== actual.uid ||
            process.getgid?.() !== actual.gid
        )
            throw new Error('raw_context');
        NativeClaudeRawProcessRepository.validateEnvironment(
            process.env,
            hostname(),
            process.versions.node,
        );
        const status = readFileSync('/proc/self/status', 'utf8');
        const field = (name: string) =>
            status.match(new RegExp(`^${name}:\\s*(\\S+)`, 'm'))?.[1] ?? null;
        const routes = [
            ...readFileSync('/proc/net/route', 'utf8')
                .trim()
                .split('\n')
                .slice(1)
                .filter((line) => line.trim() && line.trim().split(/\s+/)[0] !== 'lo'),
            ...readFileSync('/proc/net/ipv6_route', 'utf8')
                .trim()
                .split('\n')
                .filter((line) => line.trim() && line.trim().split(/\s+/).at(-1) !== 'lo'),
        ];
        const capabilities = Object.fromEntries(
            ['CapEff', 'CapPrm', 'CapBnd'].map((name) => [name, field(name)]),
        );
        if (
            field('NoNewPrivs') !== '1' ||
            field('Seccomp') !== '2' ||
            routes.length ||
            Object.values(capabilities).some((value) => value !== '0000000000000000')
        )
            throw new Error('raw_confinement_context');
        this.files.directory('/pilot/consumer');
        const inputs = this.hashes(expected as Record<string, string>);
        if (
            inputs.source !==
                contract[selection.pin === 'a' ? 'source_a' : 'source_b'].tree_sha256 ||
            inputs.source_a !== contract.source_a.tree_sha256 ||
            inputs.source_b !== contract.source_b.tree_sha256 ||
            inputs.codex !== contract.binaries.codex.sha256 ||
            inputs.claude !== contract.binaries.claude.sha256 ||
            inputs.node !== contract.binaries.node.sha256 ||
            inputs.observer !== contract.observer.tree_sha256 ||
            inputs.driver !== contract.driver.tree_sha256
        )
            throw new Error('raw_pin');
        this.contextValue = {
            schema_version: 1,
            mode: 'native',
            contract,
            nonce: request.nonce as string,
            selection,
            account: {
                name: actual.username,
                uid: actual.uid,
                gid: actual.gid,
                home: actual.homedir,
            },
            environment: Object.entries(process.env)
                .map(([key, value]) => `${key}=${value}`)
                .sort(),
            platform: `${process.platform}/${process.arch}`,
            observer_pid: process.pid,
            observer_start_ticks: this.startTicks(process.pid),
            no_new_privileges: field('NoNewPrivs'),
            seccomp: field('Seccomp'),
            capabilities,
            routes,
            inputs,
            evidence_scope: 'context-measurement-only',
        };
        this.recipe = new NativeClaudeRawConfiguration().commands(
            contract.mcp.claude[selection.pin],
            new NativeClaudeRawConfiguration().diagnostic(selection),
            selection.phase,
        );
        return this.contextValue;
    }

    async snapshot(context: NativeClaudeRawContext): Promise<NativeClaudeSourceSnapshot> {
        if (context !== this.contextValue) throw new Error('raw_context_identity');
        const key = context.selection.pin === 'a' ? 'source_a' : 'source_b';
        const selected = this.inventory.tree(`/pilot/input/${key}`);
        const actual = this.inventory.tree('/pilot/source');
        if (
            selected.tree_sha256 !== context.contract[key].tree_sha256 ||
            actual.tree_sha256 !== selected.tree_sha256
        )
            throw new Error('raw_selected_source_changed');
        const manifest = (path: string) => {
            const bytes = this.files.read(`/pilot/input/${key}/${path}`, 1_048_576);
            const entry = selected.entries.find(
                (entry) => entry.path === path && entry.kind === 'file',
            );
            if (!entry || entry.bytes !== bytes.length || entry.sha256 !== pilotDigest(bytes))
                throw new Error('raw_manifest_changed');
            return {
                bytes: bytes.length,
                sha256: pilotDigest(bytes),
                base64: bytes.toString('base64'),
            };
        };
        return {
            schema_version: 1,
            pin: context.selection.pin,
            source_root: '/pilot/source',
            selected_inventory: selected,
            actual_inventory: actual,
            plugin_manifest: manifest('.claude-plugin/plugin.json'),
            mcp_manifest: manifest('mcp/claude.json'),
            hook_manifest: manifest('hooks/claude.json'),
        };
    }

    async recheck(context: NativeClaudeRawContext): Promise<boolean> {
        return (
            JSON.stringify(this.hashes(context.inputs)) === JSON.stringify(context.inputs) &&
            JSON.stringify(
                Object.entries(process.env)
                    .map(([key, value]) => `${key}=${value}`)
                    .sort(),
            ) === JSON.stringify(context.environment)
        );
    }

    async run(command: NativeClaudeRawCommand): Promise<NativeClaudeRawProcess> {
        if (
            !this.contextValue ||
            !this.recipe.some(
                (known) =>
                    known.label === command.label &&
                    JSON.stringify(known.argv) === JSON.stringify(command.argv),
            ) ||
            command.executable !== '/pilot/runtime-bin/claude' ||
            command.cwd !== '/pilot/consumer' ||
            command.stdin !== null ||
            !Number.isSafeInteger(command.timeout_ms) ||
            command.timeout_ms < 1 ||
            command.timeout_ms > NativeClaudeRawConfiguration.commandMs ||
            command.output_bytes !== NativeClaudeRawConfiguration.outputBytes ||
            this.inventory.file(command.executable, 536_870_912).sha256 !==
                this.contextValue.contract.binaries.claude.sha256
        )
            throw new Error('raw_command');
        return await new Promise((resolve) => {
            const chunks: { stdout: Buffer[]; stderr: Buffer[] } = { stdout: [], stderr: [] };
            let count = 0;
            let status: NativeClaudeRawProcess['status'] = 'completed';
            let ticks: string | null = null;
            let identity: NativeClaudeChildIdentity = {
                schema_version: 2,
                status: 'unavailable',
                pid: null,
                observer_pid: process.pid,
                start_ticks: null,
                executable: null,
                stat_before: null,
                stat_after: null,
            };
            let finished = false;
            const child = spawn(command.executable, command.argv, {
                cwd: command.cwd,
                shell: false,
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                // Deliberately inherit the measured ordinary account environment without overrides.
            });
            let escalation: ReturnType<typeof setTimeout> | null = null;
            const kill = (signal: NodeJS.Signals) => {
                if (!child.pid) return;
                try {
                    process.kill(-child.pid, signal);
                } catch {
                    /* Outcome is checked, never asserted. */
                }
            };
            const stop = () => {
                kill('SIGTERM');
                if (!escalation) escalation = setTimeout(() => kill('SIGKILL'), 100);
            };
            const timer = setTimeout(() => {
                status = 'timeout';
                stop();
            }, command.timeout_ms);
            child.once('spawn', () => {
                if (!child.pid) return;
                identity = this.captureChildIdentity(child.pid, process.pid);
                ticks = identity.start_ticks;
            });
            for (const stream of ['stdout', 'stderr'] as const) {
                child[stream].on('data', (chunk: Buffer) => {
                    const remaining = command.output_bytes - count;
                    if (remaining > 0) chunks[stream].push(chunk.subarray(0, remaining));
                    count += Math.min(chunk.length, Math.max(0, remaining));
                    if (chunk.length > remaining) {
                        status = 'output-limit';
                        stop();
                    }
                });
            }
            child.once('error', (error: NodeJS.ErrnoException) => {
                status = error.code === 'ENOENT' ? 'unavailable' : 'execution-error';
            });
            const finish = (exit: number | null, signal: NodeJS.Signals | null) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (escalation) clearTimeout(escalation);
                kill('SIGKILL');
                let cleanup: NativeClaudeRawProcess['cleanup'] = child.pid
                    ? 'unverified'
                    : 'group-absent';
                if (child.pid) {
                    try {
                        process.kill(-child.pid, 0);
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code === 'ESRCH')
                            cleanup = 'group-absent';
                    }
                }
                resolve({
                    status,
                    exit_code: Number.isSafeInteger(exit) ? exit : null,
                    signal,
                    pid: child.pid ?? null,
                    start_ticks: ticks,
                    identity,
                    stdout: Buffer.concat(chunks.stdout),
                    stderr: Buffer.concat(chunks.stderr),
                    cleanup,
                });
            };
            child.once('close', finish);
        });
    }
}
