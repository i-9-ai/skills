// SPDX-License-Identifier: Apache-2.0
import { CodexJsonlCodec } from './CodexJsonlCodec.ts';
import { NativeCodexProtocolValidator } from '../validator/NativeCodexProtocolValidator.ts';
import type { RpcMethod } from '../validator/NativeCodexProtocolValidator.ts';
import { NativeCodexDiagnosticValidator } from '../validator/NativeCodexDiagnosticValidator.ts';

export type ProcessEvent =
    | { kind: 'bytes'; stream: 'stdout' | 'stderr'; bytes: Uint8Array }
    | {
          kind: 'exit';
          exitCode: number | null;
          signal: string | null;
          timedOut: boolean;
          outputTruncated: boolean;
          /** Actual native transport records intent when the exit occurs, before queue delivery. */
          terminationRequested?: boolean;
      };
export type StreamingProcess = {
    write(bytes: Uint8Array): Promise<void>;
    events(): AsyncIterable<ProcessEvent>;
    /** Resolves only after the actual owned process exit has been observed. */
    terminate(): Promise<{ exited: true }>;
};
export type Notification = {
    method: string;
    params: any;
    emittedAtMs?: number;
};
type Pending = {
    method: RpcMethod;
    resolve(value: any): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
};

/** Owns a bounded JSONL lifetime. No server request receives an automatic approval. */
export class CodexRpcSession {
    private readonly process: StreamingProcess;
    private readonly validator: NativeCodexProtocolValidator;
    private readonly codec = new CodexJsonlCodec();
    private readonly diagnostic = new NativeCodexDiagnosticValidator();
    private readonly pending = new Map<number, Pending>();
    private readonly notifications: Notification[] = [];
    private readonly waiters = new Set<() => void>();
    private readonly pump: Promise<void>;
    private failure: Error | undefined;
    private sequence = 0;
    private closing = false;
    private exited = false;
    private readonly timeoutMs: number;

    constructor(
        process: StreamingProcess,
        validator: NativeCodexProtocolValidator,
        timeoutMs = 10_000,
    ) {
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000)
            throw new Error('rpc_timeout_bound');
        this.process = process;
        this.validator = validator;
        this.timeoutMs = timeoutMs;
        this.pump = this.read().catch((error) =>
            this.fail(error instanceof Error ? error : new Error('protocol_failure')),
        );
    }

    async request(method: RpcMethod, params: unknown): Promise<any> {
        this.guard();
        if (++this.sequence > 64 || this.pending.size !== 0) throw new Error('rpc_request_bound');
        this.validator.request(method, params);
        const id = this.sequence;
        const promise = new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => this.fail(new Error('rpc_timeout')), this.timeoutMs);
            this.pending.set(id, { method, resolve, reject, timer });
        });
        try {
            await this.process.write(CodexJsonlCodec.encode({ id, method, params }));
        } catch {
            this.fail(new Error('protocol_write_failed'));
        }
        return promise;
    }

    async initialized(): Promise<void> {
        this.guard();
        await this.process.write(CodexJsonlCodec.encode({ method: 'initialized' }));
    }

    async wait(predicate: (notification: Notification) => boolean): Promise<Notification> {
        const started = Date.now();
        for (;;) {
            this.guard();
            const found = this.notifications.find(predicate);
            if (found) return found;
            const remaining = this.timeoutMs - (Date.now() - started);
            if (remaining <= 0) throw new Error('notification_timeout');
            await new Promise<void>((resolve) => {
                let timer: ReturnType<typeof setTimeout>;
                const wake = () => {
                    clearTimeout(timer);
                    this.waiters.delete(wake);
                    resolve();
                };
                this.waiters.add(wake);
                timer = setTimeout(wake, remaining);
            });
        }
    }

    observed(): readonly Notification[] {
        this.guard();
        return this.notifications;
    }

    diagnostics() {
        this.guard();
        return this.diagnostic.observed();
    }

    async close(): Promise<void> {
        this.closing = true;
        const termination = await this.process.terminate();
        if (termination.exited !== true) throw new Error('process_cleanup_unverified');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                this.pump,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('process_cleanup_timeout')), 2000);
                }),
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
        if (this.failure) throw this.failure;
        if (!this.exited) throw new Error('process_cleanup_unverified');
    }

    private guard(): void {
        if (this.failure) throw this.failure;
        if (this.exited || this.closing) throw new Error('process_not_running');
    }
    private fail(error: Error): void {
        this.failure ??= error;
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(this.failure);
        }
        this.pending.clear();
        for (const wake of this.waiters) wake();
    }
    private async read(): Promise<void> {
        for await (const event of this.process.events()) {
            if (event.kind === 'exit') {
                this.exited = true;
                this.diagnostic.finish();
                this.codec.finish();
                if (
                    !this.closing ||
                    event.terminationRequested === false ||
                    event.timedOut ||
                    event.outputTruncated ||
                    event.exitCode !== 0 ||
                    event.signal !== null
                )
                    throw new Error('unexpected_process_exit');
                return;
            }
            if (event.stream === 'stderr') {
                this.diagnostic.push(event.bytes);
                continue;
            }
            for (const input of this.codec.push(event.bytes)) this.frame(input);
        }
        if (!this.exited) throw new Error('missing_process_exit');
    }
    private frame(input: unknown): void {
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('protocol_envelope');
        const frame = input as Record<string, any>;
        if (Object.hasOwn(frame, 'method')) {
            if (
                Object.keys(frame).some(
                    (key) => !['method', 'params', 'emittedAtMs'].includes(key),
                ) ||
                typeof frame.method !== 'string' ||
                (Object.hasOwn(frame, 'emittedAtMs') &&
                    (!Number.isSafeInteger(frame.emittedAtMs) || frame.emittedAtMs < 0))
            )
                throw new Error('unexpected_server_request');
            this.validator.notification(frame.method, frame.params);
            if (this.notifications.length >= 256) throw new Error('notification_count_bound');
            this.notifications.push({
                method: frame.method,
                params: frame.params,
                ...(Object.hasOwn(frame, 'emittedAtMs') ? { emittedAtMs: frame.emittedAtMs } : {}),
            });
            for (const wake of this.waiters) wake();
            return;
        }
        if (
            Object.keys(frame).some((key) => !['id', 'result', 'error'].includes(key)) ||
            !Number.isSafeInteger(frame.id)
        )
            throw new Error('protocol_envelope');
        const pending = this.pending.get(frame.id);
        if (!pending || Object.hasOwn(frame, 'error') || !Object.hasOwn(frame, 'result'))
            throw new Error('unexpected_rpc_response');
        this.validator.response(pending.method, frame.result);
        clearTimeout(pending.timer);
        this.pending.delete(frame.id);
        pending.resolve(frame.result);
    }
}
