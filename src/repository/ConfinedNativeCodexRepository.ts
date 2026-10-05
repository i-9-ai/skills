// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import {
    constants,
    closeSync,
    fstatSync,
    lstatSync,
    openSync,
    readFileSync,
    readdirSync,
    readlinkSync,
    readSync,
    realpathSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type {
    ArtifactEntry,
    ArtifactInventory,
    FileIdentity,
    ObserverConfinement,
} from '../service/NativeCodexObservationService.ts';
import type { ProcessEvent, StreamingProcess } from '../transport/CodexRpcSession.ts';
import type { FixtureHost } from '../transport/LoopbackResponsesFixture.ts';
import { NativeCodexConfiguration } from '../config/NativeCodexConfiguration.ts';
import { NativePilotRegistrationObservationValidator } from '../validator/NativePilotRegistrationObservationValidator.ts';
import { NativePilotStateSnapshotRepository } from './NativePilotStateSnapshotRepository.ts';
import type { NativePilotStateSnapshot } from './NativePilotStateSnapshotRepository.ts';

interface NativeCodexChildReader {
    stat(pid: number): Buffer;
    executable(pid: number): string;
}
const childReader: NativeCodexChildReader = {
    stat(pid) {
        const fd = openSync(`/proc/${pid}/stat`, constants.O_RDONLY);
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

export interface NativeCodexProcessEvent {
    event:
        | 'started'
        | 'termination-requested'
        | 'stdin-eof-requested'
        | 'signal-requested'
        | 'exit'
        | 'streams-closed'
        | 'execution-error';
    elapsed_ms: number;
    pid: number | null;
    signal: string | null;
    exit_code: number | null;
    timed_out: boolean;
    output_truncated: boolean;
    execution_error: boolean;
}

/** Actual implementations are callable only inside the explicitly measured fixed pilot lane. */
export class ConfinedNativeCodexRepository implements ObserverConfinement {
    readonly evidenceKind = 'confined_native' as const;
    readonly fixture: FixtureHost;
    readonly raw: {
        direction: 'request' | 'stdout' | 'stderr' | 'fixture-request' | 'fixture-response';
        bytes: Uint8Array;
    }[] = [];
    readonly processEvents: NativeCodexProcessEvent[] = [];
    private readonly execute: typeof spawn;
    private readonly fixtureServer: typeof createServer;
    readonly fixtureExchanges: Array<Record<string, unknown>> = [];
    fixtureRequestCount = 0;
    private readonly sendSignal: typeof process.kill;
    private readonly child: NativeCodexChildReader;
    private readonly stateOutput: string | null;
    readonly processObservations: Array<Record<string, unknown>> = [];
    readonly stateArtifacts: Array<{ role: string; path: string; bytes: number; sha256: string }> =
        [];
    private rawBytes = 0;
    private fixtureBaseUrl: string | undefined;
    private captureFailure: Error | undefined;
    constructor(
        options: {
            execute?: typeof spawn;
            signal?: typeof process.kill;
            child?: NativeCodexChildReader;
            outputRoot?: string;
            server?: typeof createServer;
        } = {},
    ) {
        this.execute = options.execute ?? spawn;
        this.fixtureServer = options.server ?? createServer;
        this.sendSignal = options.signal ?? process.kill;
        this.child = options.child ?? childReader;
        this.stateOutput = options.outputRoot ?? null;
        this.fixture = {
            start: async (handler, limits) => {
                this.boundary();
                if (
                    JSON.stringify(limits) !==
                    JSON.stringify({
                        address: '127.0.0.1',
                        requests: 1,
                        bodyBytes: 1_048_576,
                        timeoutMs: 10_000,
                    })
                )
                    throw new Error('fixture_limits');
                const sockets = new Set<import('node:net').Socket>();
                let count = 0;
                const server = this.fixtureServer((request, response) => {
                    this.fixtureRequestCount++;
                    request.setTimeout(limits.timeoutMs, () => request.destroy());
                    if (++count > limits.requests) {
                        response.writeHead(400);
                        response.end();
                        return;
                    }
                    const chunks: Buffer[] = [];
                    let length = 0;
                    request.on('data', (chunk: Buffer) => {
                        length += chunk.length;
                        if (length > limits.bodyBytes) {
                            request.destroy();
                            return;
                        }
                        chunks.push(chunk);
                    });
                    request.on('end', () => {
                        const seen = new Set<string>();
                        for (let i = 0; i < request.rawHeaders.length; i += 2) {
                            const key = request.rawHeaders[i].toLowerCase();
                            if (seen.has(key)) {
                                response.writeHead(400);
                                response.end();
                                return;
                            }
                            seen.add(key);
                        }
                        try {
                            const body = Buffer.concat(chunks);
                            this.capture('fixture-request', body);
                            const result = handler({
                                method: request.method ?? '',
                                path: request.url ?? '',
                                headers: request.headers,
                                body,
                            });
                            if (
                                request.rawHeaders.length > 128 ||
                                request.rawHeaders.some((part) => Buffer.byteLength(part) > 4096) ||
                                Buffer.byteLength(JSON.stringify(request.rawHeaders)) > 16_384
                            )
                                throw new Error('fixture_header_bound');
                            this.fixtureExchanges.push({
                                method: request.method ?? '',
                                path: request.url ?? '',
                                raw_headers: [...request.rawHeaders],
                                request_sha256: createHash('sha256').update(body).digest('hex'),
                                request_bytes: body.length,
                                status: result.status,
                                response_headers: { ...result.headers },
                                response_sha256: createHash('sha256')
                                    .update(result.body)
                                    .digest('hex'),
                                response_bytes: result.body.length,
                            });
                            this.capture('fixture-response', result.body);
                            response.writeHead(result.status, result.headers);
                            response.end(result.body);
                        } catch {
                            this.captureFailure = new Error('fixture_capture_bound');
                            response.writeHead(400);
                            response.end();
                        }
                    });
                    request.on('error', () => response.destroy());
                });
                server.on('connection', (socket) => {
                    sockets.add(socket);
                    socket.setTimeout(limits.timeoutMs, () => socket.destroy());
                    socket.on('close', () => sockets.delete(socket));
                });
                await new Promise<void>((resolve, reject) => {
                    server.once('error', reject);
                    server.listen({ host: limits.address, port: 0 }, () => {
                        server.off('error', reject);
                        resolve();
                    });
                });
                const address = server.address();
                if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
                    server.close();
                    throw new Error('fixture_bind');
                }
                this.fixtureBaseUrl = `http://127.0.0.1:${address.port}/v1`;
                return {
                    baseUrl: this.fixtureBaseUrl,
                    close: async () => {
                        for (const socket of sockets) socket.destroy();
                        await new Promise<void>((resolve, reject) =>
                            server.close((error) =>
                                error ? reject(new Error('fixture_cleanup')) : resolve(),
                            ),
                        );
                        if (server.listening || sockets.size) throw new Error('fixture_cleanup');
                        if (count > 1) throw new Error('fixture_request_count');
                        if (this.captureFailure) throw this.captureFailure;
                    },
                };
            },
        };
    }

    async start(argv: readonly string[]): Promise<StreamingProcess> {
        this.boundary();
        if (
            !this.fixtureBaseUrl ||
            JSON.stringify(argv) !==
                JSON.stringify(NativeCodexConfiguration.argv(this.fixtureBaseUrl))
        )
            throw new Error('native_argv');
        if (
            argv[0] !== 'app-server' ||
            argv[1] !== '--stdio' ||
            argv.length > 64 ||
            argv.some((arg) => typeof arg !== 'string' || arg.length > 4096 || arg.includes('\0'))
        )
            throw new Error('native_argv');
        const child = this.execute('/pilot/runtime-bin/codex', [...argv], {
            cwd: '/pilot/consumer',
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
            shell: false,
        });
        let identity: { pid: number; start_ticks: string } | undefined;
        const observation: Record<string, unknown> = {
            executable: '/pilot/runtime-bin/codex',
            argv: [...argv],
            cwd: '/pilot/consumer',
            identity: {
                schema_version: 2,
                expected_ppid: process.pid,
                status: 'unavailable',
                pid: child.pid ?? null,
                start_ticks: null,
                executable: null,
                stat_before: null,
                stat_after: null,
            },
        };
        this.processObservations.push(observation);
        const ready = new Promise<void>((resolve) => {
            child.once('spawn', () => {
                const expectedParent = process.pid;
                let before: Buffer | null = null;
                let after: Buffer | null = null;
                let executable: string | null = null;
                const owned = (bytes: Buffer | null, pid: number) => {
                    if (!bytes) return null;
                    const actual = new NativePilotRegistrationObservationValidator().childStat(
                        bytes,
                        pid,
                    );
                    if (!actual) return null;
                    const fields = bytes
                        .toString('utf8')
                        .slice(bytes.toString('utf8').lastIndexOf(')') + 2)
                        .trim()
                        .split(/\s+/);
                    return fields[1] === String(expectedParent) ? actual : null;
                };
                try {
                    if (child.pid) {
                        before = this.child.stat(child.pid);
                        executable = this.child.executable(child.pid);
                        after = this.child.stat(child.pid);
                        const first = owned(before, child.pid);
                        const second = owned(after, child.pid);
                        if (
                            first &&
                            second &&
                            first.start_ticks === second.start_ticks &&
                            executable === '/pilot/runtime-bin/codex'
                        )
                            identity = second;
                    }
                } catch {
                    /* Every unavailable or unstable sample remains blocked before RPC. */
                }
                const retained = (bytes: Buffer | null) =>
                    bytes && bytes.length <= 4097
                        ? {
                              bytes: bytes.length,
                              sha256: createHash('sha256').update(bytes).digest('hex'),
                              base64: bytes.toString('base64'),
                          }
                        : null;
                const statBefore = retained(before);
                const statAfter = retained(after);
                observation.identity = {
                    schema_version: 2,
                    expected_ppid: expectedParent,
                    status: identity
                        ? 'observed'
                        : statBefore || statAfter
                          ? 'invalid'
                          : 'unavailable',
                    pid: identity?.pid ?? child.pid ?? null,
                    start_ticks: identity?.start_ticks ?? null,
                    executable,
                    stat_before: statBefore,
                    stat_after: statAfter,
                };
                resolve();
            });
            child.once('error', resolve);
            child.once('close', resolve);
        });
        const queue: ProcessEvent[] = [];
        let wake: (() => void) | undefined;
        let exited = false;
        let nativeExited = false;
        let timedOut = false;
        let truncated = false;
        let terminationRequested = false;
        let exitFacts: Extract<ProcessEvent, { kind: 'exit' }> | null = null;
        const started = Date.now();
        const deadline = started + 40_000;
        const record = (
            event: NativeCodexProcessEvent['event'],
            signal: string | null = null,
            exit_code: number | null = null,
            execution_error = false,
        ) => {
            this.processEvents.push({
                event,
                elapsed_ms: Math.max(0, Date.now() - started),
                pid: child.pid ?? null,
                signal,
                exit_code,
                timed_out: timedOut,
                output_truncated: truncated,
                execution_error,
            });
        };
        record('started');
        const enqueue = (event: ProcessEvent) => {
            queue.push(event);
            wake?.();
            wake = undefined;
        };
        const kill = (signal: NodeJS.Signals) => {
            if (child.pid && !exited && !nativeExited) {
                try {
                    record('signal-requested', signal);
                    this.sendSignal(-child.pid, signal);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
                        throw new Error('native_cleanup');
                }
            }
        };
        const timer = setTimeout(
            () => {
                timedOut = true;
                kill('SIGKILL');
            },
            Math.max(0, deadline - Date.now()),
        );
        for (const stream of ['stdout', 'stderr'] as const)
            child[stream].on('data', (bytes: Buffer) => {
                if (this.rawBytes + bytes.length > 1_048_576) {
                    truncated = true;
                    kill('SIGKILL');
                    return;
                }
                this.capture(stream, bytes);
                enqueue({ kind: 'bytes', stream, bytes });
            });
        child.on('error', () => {
            if (exited) return;
            exited = true;
            clearTimeout(timer);
            record('execution-error', null, null, true);
            enqueue({
                kind: 'exit',
                exitCode: null,
                signal: null,
                timedOut,
                outputTruncated: truncated,
                terminationRequested,
            });
        });
        child.once('exit', (exitCode, signal) => {
            nativeExited = true;
            clearTimeout(timer);
            record('exit', signal, exitCode);
            exitFacts = {
                kind: 'exit',
                exitCode,
                signal,
                timedOut,
                outputTruncated: truncated,
                terminationRequested,
            };
        });
        child.on('close', (exitCode, signal) => {
            if (exited) return;
            exited = true;
            clearTimeout(timer);
            const matches =
                exitFacts !== null &&
                exitFacts.exitCode === exitCode &&
                exitFacts.signal === signal;
            record('streams-closed', signal, exitCode, !matches);
            if (matches) {
                enqueue({
                    ...exitFacts!,
                    outputTruncated: truncated || exitFacts!.outputTruncated,
                });
                return;
            }
            enqueue({
                kind: 'exit',
                exitCode,
                signal,
                timedOut,
                outputTruncated: truncated,
                terminationRequested: false,
            });
        });
        let stopping: Promise<{ exited: true }> | undefined;
        await ready;
        return {
            identity,
            write: async (bytes) => {
                this.capture('request', bytes);
                await new Promise<void>((resolve, reject) =>
                    child.stdin.write(bytes, (error) =>
                        error ? reject(new Error('native_stdin')) : resolve(),
                    ),
                );
            },
            events: async function* () {
                for (;;) {
                    while (queue.length) {
                        const event = queue.shift()!;
                        yield event;
                        if (event.kind === 'exit') return;
                    }
                    await new Promise<void>((resolve) => {
                        wake = resolve;
                    });
                }
            },
            terminate: () => {
                stopping ??= new Promise<{ exited: true }>((resolve, reject) => {
                    terminationRequested = true;
                    record('termination-requested');
                    if (exited) {
                        resolve({ exited: true });
                        return;
                    }
                    child.once('close', () => resolve({ exited: true }));
                    const remaining = Math.max(0, deadline - Date.now());
                    // EOF starts upstream RPC/thread cleanup. Use the existing lifetime
                    // rather than replacing that cleanup with an unconditional 500ms signal.
                    const term = setTimeout(() => kill('SIGTERM'), Math.max(0, remaining - 1000));
                    const final = setTimeout(
                        () => reject(new Error('native_cleanup_timeout')),
                        remaining + 500,
                    );
                    child.once('close', () => {
                        clearTimeout(term);
                        clearTimeout(final);
                    });
                    // The pinned stdio transport starts connection cleanup on EOF. Retain
                    // that request and its actual exit before any bounded signal escalation.
                    record('stdin-eof-requested');
                    child.stdin.end();
                });
                return stopping;
            },
        };
    }

    async fingerprint(root: string): Promise<FileIdentity[]> {
        const inventory = await this.artifact(root);
        if (inventory.entries.some((entry) => entry.kind === 'symlink'))
            throw new Error('linked_skill_package');
        return inventory.entries
            .filter((entry) => entry.kind === 'file')
            .map((entry) => ({ path: entry.path, sha256: entry.sha256!, bytes: entry.bytes }));
    }

    async captureState(label: 'mcp-before' | 'mcp-after'): Promise<{
        snapshot: NativePilotStateSnapshot;
        artifacts: Array<{ role: string; path: string; bytes: number; sha256: string }>;
    }> {
        if (!['mcp-before', 'mcp-after'].includes(label)) throw new Error('native_mcp_state_label');
        this.boundary();
        if (!this.stateOutput) throw new Error('native_mcp_state_output');
        const prefix = relative('/pilot/native-output', this.stateOutput);
        if (!prefix || prefix.startsWith('../') || prefix.includes('\\') || prefix.startsWith('/'))
            throw new Error('native_mcp_state_locator');
        const repository = new NativePilotStateSnapshotRepository({
            home: homedir(),
            outputRoot: this.stateOutput,
        });
        const snapshot = repository.snapshot(label);
        const role = label === 'mcp-before' ? 'state-before-mcp' : 'state-after-mcp';
        const artifacts = repository.artifacts(label).map((file) => ({
            ...file,
            path: `${prefix}/${file.path}`,
            role: file.path.endsWith('-state.json') ? role : 'state-bytes',
        }));
        this.stateArtifacts.push(...artifacts);
        return { snapshot, artifacts };
    }

    async artifact(selected: string): Promise<ArtifactInventory> {
        this.boundary();
        if (
            resolve(selected) !== selected ||
            !(
                selected === '/pilot/source' ||
                selected.startsWith('/pilot/source/') ||
                selected.startsWith(`${NativeCodexConfiguration.accountHome}/.codex/`)
            )
        )
            throw new Error('native_inventory_root');
        const root = realpathSync(selected);
        if (
            !(
                root === '/pilot/source' ||
                root.startsWith('/pilot/source/') ||
                root.startsWith(`${NativeCodexConfiguration.accountHome}/.codex/`)
            ) ||
            !lstatSync(root).isDirectory()
        )
            throw new Error('native_inventory_root');
        const entries: ArtifactEntry[] = [];
        let bytes = 0;
        const walk = (directory: string) => {
            const before = lstatSync(directory);
            const names = readdirSync(directory).sort();
            for (const name of names) {
                const filename = join(directory, name),
                    part = relative(root, filename),
                    stat = lstatSync(filename);
                if (
                    entries.length >= 10_000 ||
                    /[\\\x00-\x1f\x7f]/.test(part) ||
                    part.length > 1024
                )
                    throw new Error('native_inventory_bound');
                if (stat.isDirectory()) {
                    entries.push({
                        path: part,
                        kind: 'directory',
                        bytes: 0,
                        sha256: null,
                        executable: false,
                        target: null,
                    });
                    walk(filename);
                    continue;
                }
                if (stat.isSymbolicLink()) {
                    const target = readlinkSync(filename),
                        resolved = resolve(dirname(filename), target),
                        physical = realpathSync(filename);
                    if (
                        target.startsWith('/') ||
                        /[\\\x00-\x1f\x7f]/.test(target) ||
                        !resolved.startsWith(root + '/') ||
                        !physical.startsWith(root + '/')
                    )
                        throw new Error('native_inventory_link');
                    entries.push({
                        path: part,
                        kind: 'symlink',
                        bytes: Buffer.byteLength(target),
                        sha256: createHash('sha256').update(target).digest('hex'),
                        executable: false,
                        target,
                    });
                    continue;
                }
                if (!stat.isFile() || stat.nlink !== 1 || stat.size > 33_554_432)
                    throw new Error('native_inventory_file');
                const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
                try {
                    const initial = fstatSync(fd),
                        hash = createHash('sha256'),
                        chunk = Buffer.alloc(65_536);
                    let length = 0;
                    if (initial.ino !== stat.ino || initial.dev !== stat.dev)
                        throw new Error('native_inventory_changed');
                    for (;;) {
                        const count = readSync(fd, chunk);
                        if (!count) break;
                        length += count;
                        if (length > 33_554_432) throw new Error('native_inventory_bound');
                        hash.update(chunk.subarray(0, count));
                    }
                    const after = fstatSync(fd),
                        current = lstatSync(filename);
                    if (
                        length !== initial.size ||
                        initial.size !== after.size ||
                        initial.mtimeMs !== after.mtimeMs ||
                        initial.ctimeMs !== after.ctimeMs ||
                        current.ino !== after.ino ||
                        current.dev !== after.dev ||
                        current.nlink !== 1 ||
                        current.mtimeMs !== after.mtimeMs ||
                        current.ctimeMs !== after.ctimeMs
                    )
                        throw new Error('native_inventory_changed');
                    bytes += length;
                    if (bytes > 536_870_912) throw new Error('native_inventory_bound');
                    entries.push({
                        path: part,
                        kind: 'file',
                        bytes: length,
                        sha256: hash.digest('hex'),
                        executable: Boolean(initial.mode & 0o111),
                        target: null,
                    });
                } finally {
                    closeSync(fd);
                }
            }
            const after = lstatSync(directory);
            if (
                before.ino !== after.ino ||
                before.mtimeMs !== after.mtimeMs ||
                before.ctimeMs !== after.ctimeMs ||
                JSON.stringify(names) !== JSON.stringify(readdirSync(directory).sort())
            )
                throw new Error('native_inventory_changed');
        };
        walk(root);
        entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        return {
            tree_sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
            bytes,
            entries,
        };
    }

    private capture(
        direction: 'request' | 'stdout' | 'stderr' | 'fixture-request' | 'fixture-response',
        bytes: Uint8Array,
    ): void {
        this.rawBytes += bytes.length;
        if (this.rawBytes > 1_048_576) throw new Error('native_capture_bound');
        this.raw.push({ direction, bytes: Uint8Array.from(bytes) });
    }
    private boundary(): void {
        if (
            process.platform !== 'linux' ||
            process.arch !== 'arm64' ||
            process.getuid?.() !== 1000 ||
            process.getgid?.() !== 1000 ||
            homedir() !== NativeCodexConfiguration.accountHome ||
            process.env.HOME !== NativeCodexConfiguration.accountHome ||
            process.env.CODEX_HOME !== undefined
        )
            throw new Error('native_boundary');
        // These are local fail-closed preconditions; mount/network/seccomp proof belongs to the controller.
        const passwd = readFileSync('/etc/passwd', 'utf8')
            .split('\n')
            .find((row) => row.startsWith('node:'))
            ?.split(':');
        if (
            passwd?.[2] !== '1000' ||
            passwd?.[3] !== '1000' ||
            passwd?.[5] !== NativeCodexConfiguration.accountHome
        )
            throw new Error('native_account');
    }
}
