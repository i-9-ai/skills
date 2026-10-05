// SPDX-License-Identifier: Apache-2.0
import type { NativePilotStep } from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';

export interface NativePilotProcess {
    status:
        | 'completed'
        | 'timeout'
        | 'unavailable'
        | 'interrupted'
        | 'execution-error'
        | 'output-limit';
    exit_code: number | null;
    signal: 'SIGTERM' | 'SIGKILL' | 'SIGINT' | 'other' | null;
}

export type NativePilotExecutor = (
    executable: string,
    args: string[],
    options: {
        cwd: string;
        shell: false;
        timeout: number;
        maxBuffer: number;
        encoding: 'utf8';
        killSignal: 'SIGKILL';
    },
) => {
    status?: number | null;
    signal?: string | null;
    error?: { code?: string };
    stdout?: string | Buffer | null;
    stderr?: string | Buffer | null;
};

/** No default executor: only an explicitly reviewed, confined worker can supply one. */
export class NativePilotProcessRepository {
    run(command: NativePilotStep['commands'][number], cwd: string, execute: NativePilotExecutor) {
        let raw: ReturnType<NativePilotExecutor>;
        try {
            raw = execute(command.executable, [...command.args], {
                cwd,
                shell: false,
                timeout: command.timeout_ms,
                maxBuffer: NativePilotConfiguration.limits.output_bytes,
                encoding: 'utf8',
                killSignal: 'SIGKILL',
            });
        } catch {
            return {
                process: {
                    status: 'execution-error',
                    exit_code: null,
                    signal: null,
                } as NativePilotProcess,
                stdout: '',
                stderr: '',
            };
        }
        const exit_code = Number.isSafeInteger(raw.status) && raw.status! >= 0 ? raw.status! : null;
        const signal = raw.signal
            ? ['SIGTERM', 'SIGKILL', 'SIGINT'].includes(raw.signal)
                ? (raw.signal as 'SIGTERM' | 'SIGKILL' | 'SIGINT')
                : 'other'
            : null;
        const stdout = String(raw.stdout ?? '');
        const stderr = String(raw.stderr ?? '');
        const over =
            Buffer.byteLength(stdout) + Buffer.byteLength(stderr) >
            NativePilotConfiguration.limits.output_bytes;
        const code = raw.error?.code;
        const status: NativePilotProcess['status'] =
            over || code === 'ENOBUFS'
                ? 'output-limit'
                : code === 'ETIMEDOUT'
                  ? 'timeout'
                  : code === 'ENOENT' || code === 'EACCES'
                    ? 'unavailable'
                    : code === 'ABORT_ERR'
                      ? 'interrupted'
                      : raw.error
                        ? 'execution-error'
                        : signal
                          ? 'interrupted'
                          : exit_code === null
                            ? 'execution-error'
                            : 'completed';
        return {
            process: {
                status,
                exit_code: status === 'unavailable' ? null : exit_code,
                signal: status === 'unavailable' ? null : signal,
            } satisfies NativePilotProcess,
            stdout: over ? '' : stdout,
            stderr: over ? '' : stderr,
        };
    }
}
