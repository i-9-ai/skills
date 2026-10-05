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

/** Actual implementations are callable only inside the explicitly measured fixed pilot lane. */
export class ConfinedNativeCodexRepository implements ObserverConfinement {
    readonly evidenceKind = 'confined_native' as const;
    readonly fixture: FixtureHost;
    readonly raw: {
        direction: 'request' | 'stdout' | 'stderr' | 'fixture-request' | 'fixture-response';
        bytes: Uint8Array;
    }[] = [];
    private rawBytes = 0;
    private fixtureBaseUrl: string | undefined;
    private captureFailure: Error | undefined;
    constructor() {
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
                const server = createServer((request, response) => {
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
        const child = spawn('/pilot/runtime-bin/codex', [...argv], {
            cwd: '/pilot/consumer',
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
            shell: false,
        });
        const queue: ProcessEvent[] = [];
        let wake: (() => void) | undefined;
        let exited = false;
        let timedOut = false;
        let truncated = false;
        const enqueue = (event: ProcessEvent) => {
            queue.push(event);
            wake?.();
            wake = undefined;
        };
        const kill = (signal: NodeJS.Signals) => {
            if (child.pid && !exited) {
                try {
                    process.kill(-child.pid, signal);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
                        throw new Error('native_cleanup');
                }
            }
        };
        const timer = setTimeout(() => {
            timedOut = true;
            kill('SIGKILL');
        }, 40_000);
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
            exited = true;
            clearTimeout(timer);
            enqueue({
                kind: 'exit',
                exitCode: null,
                signal: null,
                timedOut,
                outputTruncated: truncated,
            });
        });
        child.on('close', (exitCode, signal) => {
            if (exited) return;
            exited = true;
            clearTimeout(timer);
            enqueue({ kind: 'exit', exitCode, signal, timedOut, outputTruncated: truncated });
        });
        let stopping: Promise<{ exited: true }> | undefined;
        return {
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
                    if (exited) {
                        resolve({ exited: true });
                        return;
                    }
                    child.once('close', () => resolve({ exited: true }));
                    kill('SIGTERM');
                    const force = setTimeout(() => kill('SIGKILL'), 500);
                    const final = setTimeout(
                        () => reject(new Error('native_cleanup_timeout')),
                        1500,
                    );
                    child.once('close', () => {
                        clearTimeout(force);
                        clearTimeout(final);
                    });
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
