// SPDX-License-Identifier: Apache-2.0
import { execFile } from 'node:child_process';
import type { NativePilotHost } from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type {
    NativePilotDockerExecutor,
    NativePilotDockerOutput,
} from './NativePilotDockerRepository.ts';
import { containerPath, requireContainer } from '../validator/NativePilotContainerValidator.ts';

/** Concrete bounded Docker children; selected phase operations stay argument arrays. */
export class NativePilotDockerProcessRepository {
    readonly start: typeof execFile;
    constructor(start: typeof execFile = execFile) {
        this.start = start;
    }
    /** Explicit OS-only executor: the native execute operation is not in this capability. */
    probe(): NativePilotDockerExecutor {
        return async (request) => {
            const args = request.args.slice(4);
            const operation = `${args[0]}/${args[1]}`;
            requireContainer(
                [
                    'image/inspect',
                    'volume/ls',
                    'volume/create',
                    'volume/inspect',
                    'volume/rm',
                    'container/create',
                    'container/start',
                    'container/inspect',
                    'container/exec',
                    'container/stop',
                    'container/kill',
                    'container/rm',
                    'container/ls',
                ].includes(operation),
                'Unknown probe Docker operation.',
            );
            if (operation === 'container/exec') {
                const account = args[3]?.split(':').map(Number) ?? [];
                requireContainer(
                    args[2] === '--user' &&
                        account.length === 2 &&
                        account.every(
                            (id) => Number.isSafeInteger(id) && id >= 1000 && id < 65534,
                        ) &&
                        args[4] === '--workdir' &&
                        args[5] === containerPath.consumer &&
                        /^[a-f0-9]{64}$/.test(args[6] ?? '') &&
                        args[7] === containerPath.node &&
                        args[8] === containerPath.worker &&
                        args[10] === containerPath.request &&
                        ((args[9] === 'probe' &&
                            args.length === 12 &&
                            ['fresh', 'existing'].includes(args[11])) ||
                            (['audit', 'export'].includes(args[9]) && args.length === 11)),
                    'OS-only executor cannot invoke a native observer or client.',
                );
            }
            requireContainer(
                request.shell === false &&
                    JSON.stringify(request.env) ===
                        JSON.stringify({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }),
                'Probe requires its fixed minimal Docker-client environment.',
            );
            return await new Promise<NativePilotDockerOutput>((resolve) => {
                // execFile owns this exact child. AbortSignal/timeout kills its process,
                // while the controller separately stops the proven owned container ID.
                this.start(
                    request.executable,
                    request.args,
                    {
                        cwd: request.cwd,
                        env: request.env,
                        shell: false,
                        encoding: 'utf8',
                        signal: request.signal,
                        timeout: request.timeoutMs,
                        killSignal: 'SIGKILL',
                        maxBuffer: request.maxOutputBytes,
                    },
                    (error, stdout, stderr) => {
                        const observed = error as
                            | (Error & {
                                  code?: string | number;
                                  signal?: string;
                                  killed?: boolean;
                              })
                            | null;
                        resolve({
                            exitCode: error
                                ? typeof observed?.code === 'number'
                                    ? observed.code
                                    : null
                                : 0,
                            signal: observed?.signal ?? null,
                            timedOut:
                                Boolean(observed?.killed) &&
                                !request.signal.aborted &&
                                observed?.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
                            outputTruncated: observed?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
                            stdout: String(stdout),
                            stderr: String(stderr),
                        });
                    },
                );
            });
        };
    }

    /** Fixed full-lifecycle worker operations, with the same bounded concrete child controls. */
    lifecycle(host: NativePilotHost): NativePilotDockerExecutor {
        requireContainer(host === 'codex' || host === 'claude', 'A declared host is required.');
        const probe = this.probe();
        const counts = new Map<string, number>(
            NativePilotConfiguration.phases.map((phase) => [phase, 1]),
        );
        for (const phase of ['select-a', 'select-b', 'retain', 'cleanup-owned'])
            counts.delete(phase);
        counts.set('install-a', host === 'codex' ? 2 : 3);
        for (const phase of ['update-b', 'rollback-a']) counts.set(phase, host === 'codex' ? 1 : 2);
        return async (request) => {
            const args = request.args.slice(4);
            if (!(args[0] === 'container' && args[1] === 'exec' && args[9] === 'execute'))
                return await probe(request);
            const account = args[3]?.split(':').map(Number) ?? [];
            requireContainer(
                args.length === 13 &&
                    args[2] === '--user' &&
                    account.length === 2 &&
                    account.every((id) => Number.isSafeInteger(id) && id >= 1000 && id < 65534) &&
                    args[4] === '--workdir' &&
                    args[5] === containerPath.consumer &&
                    /^[a-f0-9]{64}$/.test(args[6] ?? '') &&
                    args[7] === containerPath.node &&
                    args[8] === containerPath.worker &&
                    args[10] === containerPath.request &&
                    counts.has(args[11]) &&
                    /^[0-2]$/.test(args[12]) &&
                    Number(args[12]) < counts.get(args[11])!,
                'Lifecycle transport permits only declared fixed worker phase/index recipes.',
            );
            requireContainer(
                request.shell === false &&
                    JSON.stringify(request.env) ===
                        JSON.stringify({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }),
                'Lifecycle requires its fixed minimal Docker-client environment.',
            );
            return await new Promise<NativePilotDockerOutput>((resolve) => {
                this.start(
                    request.executable,
                    request.args,
                    {
                        cwd: request.cwd,
                        env: request.env,
                        shell: false,
                        encoding: 'utf8',
                        signal: request.signal,
                        timeout: request.timeoutMs,
                        killSignal: 'SIGKILL',
                        maxBuffer: request.maxOutputBytes,
                    },
                    (error, stdout, stderr) => {
                        const observed = error as
                            | (Error & {
                                  code?: string | number;
                                  signal?: string;
                                  killed?: boolean;
                              })
                            | null;
                        resolve({
                            exitCode: error
                                ? typeof observed?.code === 'number'
                                    ? observed.code
                                    : null
                                : 0,
                            signal: observed?.signal ?? null,
                            timedOut:
                                Boolean(observed?.killed) &&
                                !request.signal.aborted &&
                                observed?.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
                            outputTruncated: observed?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
                            stdout: String(stdout),
                            stderr: String(stderr),
                        });
                    },
                );
            });
        };
    }
}
