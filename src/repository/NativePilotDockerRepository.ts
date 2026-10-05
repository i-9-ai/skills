// SPDX-License-Identifier: Apache-2.0
import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { NativePilotInventoryRepository } from './NativePilotInventoryRepository.ts';
import {
    containerLimits,
    containerPath,
    requireContainer,
} from '../validator/NativePilotContainerValidator.ts';
import type {
    NativePilotContainerIdentity,
    NativePilotContainerPin,
} from '../validator/NativePilotContainerValidator.ts';

export interface NativePilotDockerRequest {
    executable: string;
    args: string[];
    cwd: string;
    shell: false;
    timeoutMs: number;
    maxOutputBytes: number;
    signal: AbortSignal;
    env: { PATH: '/usr/bin:/bin'; LANG: 'C'; LC_ALL: 'C' };
}
export interface NativePilotDockerOutput {
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    outputTruncated: boolean;
    stdout: string;
    stderr: string;
}
export type NativePilotDockerExecutor = (
    request: NativePilotDockerRequest,
) => Promise<NativePilotDockerOutput>;
export type NativePilotWorkerOperation =
    | { name: 'probe'; fresh: boolean }
    | { name: 'audit' | 'export' }
    | { name: 'execute'; phase: string; index: number };

/** No default executor, shell, context fallback, pull, prune or ambient Docker config. */
export class NativePilotDockerRepository {
    readonly pin: NativePilotContainerPin;
    readonly cwd: string;
    readonly execute: NativePilotDockerExecutor;
    readonly verifyHost: () => void;
    readonly retain:
        | ((request: NativePilotDockerRequest, output: NativePilotDockerOutput | null) => void)
        | undefined;
    private deadline = Number.POSITIVE_INFINITY;
    private cleanupDeadline: number | null = null;
    constructor(
        pin: NativePilotContainerPin,
        cwd: string,
        execute: NativePilotDockerExecutor,
        verifyHost?: () => void,
        retain?: (
            request: NativePilotDockerRequest,
            output: NativePilotDockerOutput | null,
        ) => void,
    ) {
        this.pin = structuredClone(pin);
        this.cwd = cwd;
        this.execute = execute;
        this.retain = retain;
        this.verifyHost =
            verifyHost ??
            (() => {
                const inventory = new NativePilotInventoryRepository();
                const file = inventory.file(pin.docker.executable, 536_870_912);
                requireContainer(
                    realpathSync(pin.docker.executable) === pin.docker.executable &&
                        file.executable &&
                        file.sha256 === pin.docker.sha256,
                    'Docker executable pin differs.',
                );
                const socket = pin.docker.endpoint.slice(7);
                requireContainer(
                    realpathSync(socket) === socket && lstatSync(socket).isSocket(),
                    'Selected local daemon is not a canonical Unix socket.',
                );
            });
    }

    private async invoke(
        args: string[],
        timeoutMs: number = containerLimits.control_ms,
        maxOutputBytes: number = containerLimits.output_bytes,
    ) {
        if (this.cleanupDeadline !== null) {
            requireContainer(
                (args[0] === 'container' &&
                    ['inspect', 'stop', 'kill', 'rm', 'ls'].includes(args[1])) ||
                    (args[0] === 'volume' && ['inspect', 'rm', 'ls'].includes(args[1])),
                'Cleanup capability cannot start or execute a process.',
            );
        }
        timeoutMs = Math.min(timeoutMs, (this.cleanupDeadline ?? this.deadline) - Date.now());
        requireContainer(timeoutMs > 0, 'Docker controller total deadline exceeded.');
        this.verifyHost();
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const request: NativePilotDockerRequest = {
            executable: this.pin.docker.executable,
            args: [
                '--host',
                this.pin.docker.endpoint,
                '--config',
                join(this.cwd, 'docker-config'),
                ...args,
            ],
            cwd: this.cwd,
            shell: false,
            timeoutMs,
            maxOutputBytes,
            signal: abort.signal,
            env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
        };
        let retentionAttempted = false;
        try {
            const output = await Promise.race([
                this.execute(request),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        abort.abort();
                        reject(
                            new Error(
                                'Docker control deadline exceeded; owned resource state is unknown.',
                            ),
                        );
                    }, timeoutMs);
                }),
            ]);
            retentionAttempted = true;
            this.retain?.(request, output);
            requireContainer(
                output &&
                    typeof output.stdout === 'string' &&
                    typeof output.stderr === 'string' &&
                    !output.timedOut &&
                    !output.outputTruncated &&
                    output.signal === null &&
                    Number.isSafeInteger(output.exitCode) &&
                    output.exitCode! >= 0 &&
                    Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr) <=
                        maxOutputBytes,
                'Docker control did not complete within bounds.',
            );
            requireContainer(
                output.exitCode === 0,
                'Docker control returned a nonzero status; no fallback attempted.',
            );
            return output.stdout;
        } catch (error) {
            if (!retentionAttempted) this.retain?.(request, null);
            throw error;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    boundUntil(deadline: number) {
        requireContainer(Number.isFinite(deadline), 'Finite controller deadline required.');
        this.deadline = Math.min(this.deadline, deadline);
    }

    beginCleanup() {
        // A one-shot rescue budget remains usable after the operational deadline.
        // It grants no create/start/exec capability and cannot be renewed.
        this.cleanupDeadline ??= Date.now() + 25_000;
    }

    private async json(args: string[]) {
        return JSON.parse(await this.invoke(args));
    }
    private id(id: string) {
        requireContainer(/^[a-f0-9]{64}$/.test(id), 'Full owned container ID required.');
        return id;
    }
    image() {
        return this.json(['image', 'inspect', this.pin.image.reference]);
    }
    volumeInspect(name: string) {
        this.volumeName(name);
        return this.json(['volume', 'inspect', name]);
    }
    async volumeExists(name: string) {
        this.volumeName(name);
        const text = await this.invoke([
            'volume',
            'ls',
            '--filter',
            `name=${name}`,
            '--format',
            '{{json .Name}}',
        ]);
        return text
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
            .includes(name);
    }
    async containerExists(id: string) {
        const text = await this.invoke([
            'container',
            'ls',
            '--all',
            '--no-trunc',
            '--filter',
            `id=${this.id(id)}`,
            '--format',
            '{{json .ID}}',
        ]);
        return text
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
            .includes(id);
    }
    private volumeName(name: string) {
        requireContainer(
            /^i9-pilot-[a-f0-9]{32}-(home|state|work|native-output)$/.test(name),
            'Owned volume name required.',
        );
    }
    volumeCreate(
        owned: NativePilotContainerIdentity,
        role: keyof NativePilotContainerIdentity['volumes'],
    ) {
        const name = owned.volumes[role];
        this.volumeName(name);
        const labels = { ...owned.labels, 'i9.pilot.role': role };
        return this.invoke([
            'volume',
            'create',
            '--driver',
            'local',
            ...Object.entries(labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
            name,
        ]);
    }
    volumeRemove(name: string) {
        this.volumeName(name);
        return this.invoke(['volume', 'rm', name]);
    }
    create(owned: NativePilotContainerIdentity) {
        const labels = Object.entries(owned.labels).flatMap(([key, value]) => [
            '--label',
            `${key}=${value}`,
        ]);
        const mounts = [
            `type=bind,src=${owned.mount},dst=/pilot,readonly,bind-propagation=rprivate`,
            ...Object.entries(owned.volumes).map(
                ([role, name]) =>
                    `type=volume,src=${name},dst=${role === 'home' ? this.pin.account.home : `/pilot/${role}`}`,
            ),
        ];
        return this.invoke([
            'container',
            'create',
            '--pull=never',
            '--name',
            owned.name,
            '--cidfile',
            join(this.cwd, 'container.id'),
            '--platform',
            this.pin.image.platform,
            '--user',
            `${this.pin.account.uid}:${this.pin.account.gid}`,
            '--workdir',
            containerPath.consumer,
            '--network',
            'none',
            '--read-only',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges=true',
            '--ipc',
            'private',
            '--cgroupns',
            'private',
            '--init',
            '--pids-limit',
            String(containerLimits.pids),
            '--memory',
            String(containerLimits.memory),
            '--memory-swap',
            String(containerLimits.memory),
            '--cpus',
            '2',
            '--restart',
            'no',
            '--stop-timeout',
            '5',
            '--no-healthcheck',
            '--tmpfs',
            '/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=1777',
            '--env',
            `PATH=${containerPath.path}`,
            '--env',
            'LANG=C.UTF-8',
            ...labels,
            ...mounts.flatMap((mount) => ['--mount', mount]),
            '--entrypoint',
            containerPath.node,
            this.pin.image.reference,
            containerPath.worker,
            'idle',
            containerPath.request,
        ]);
    }
    start(id: string) {
        return this.invoke(['container', 'start', this.id(id)]);
    }
    inspect(id: string) {
        return this.json(['container', 'inspect', this.id(id)]);
    }
    worker(
        id: string,
        operation: NativePilotWorkerOperation,
        timeoutMs: number = containerLimits.probe_ms,
    ) {
        const suffix =
            operation.name === 'execute'
                ? [operation.phase, String(operation.index)]
                : operation.name === 'probe'
                  ? [operation.fresh ? 'fresh' : 'existing']
                  : [];
        requireContainer(
            operation.name !== 'execute' ||
                (/^[a-z-]+$/.test(operation.phase) &&
                    Number.isSafeInteger(operation.index) &&
                    operation.index >= 0 &&
                    operation.index < 4),
            'Invalid fixed worker command selection.',
        );
        return this.invoke(
            [
                'container',
                'exec',
                '--user',
                `${this.pin.account.uid}:${this.pin.account.gid}`,
                '--workdir',
                containerPath.consumer,
                this.id(id),
                containerPath.node,
                containerPath.worker,
                operation.name,
                containerPath.request,
                ...suffix,
            ],
            timeoutMs,
            operation.name === 'export'
                ? containerLimits.retention_output
                : operation.name === 'execute'
                  ? containerLimits.worker_output_bytes
                  : containerLimits.output_bytes,
        );
    }
    stop(id: string) {
        return this.invoke(
            ['container', 'stop', '--time', '5', this.id(id)],
            containerLimits.kill_ms,
        );
    }
    kill(id: string) {
        return this.invoke(
            ['container', 'kill', '--signal', 'KILL', this.id(id)],
            containerLimits.kill_ms,
        );
    }
    remove(id: string) {
        return this.invoke(['container', 'rm', this.id(id)]);
    }
}
