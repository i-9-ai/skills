// SPDX-License-Identifier: Apache-2.0
import {
    closeSync,
    constants,
    fstatSync,
    lstatSync,
    openSync,
    readFileSync,
    readSync,
    readdirSync,
    readlinkSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { networkInterfaces, userInfo } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { spawnSync } from 'node:child_process';
import { NativePilotInventoryRepository, pilotDigest } from './NativePilotInventoryRepository.ts';
import { NativePilotProcessRepository } from './NativePilotProcessRepository.ts';
import { NativePilotProcessAuditRepository } from './NativePilotProcessAuditRepository.ts';
import { NativePilotNpmEnvironmentRepository } from './NativePilotNpmEnvironmentRepository.ts';
import { NativePilotPlanService } from '../service/NativePilotPlanService.ts';
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';
import {
    containerLimits,
    containerPath,
    containerRecord,
    requireContainer,
} from '../validator/NativePilotContainerValidator.ts';
import type { NativePilotWorkerRequest } from './NativePilotContainerRepository.ts';

export interface NativePilotRetainedEntry {
    path: string;
    kind: 'file' | 'directory' | 'symlink';
    bytes: number;
    sha256: string | null;
    target: string | null;
    base64: string | null;
}
const stable = (a: Stats, b: Stats) =>
    a.ino === b.ino &&
    a.dev === b.dev &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs;

/** Used only inside the selected container. Importing this module performs no I/O. */
export class NativePilotContainerWorkerRepository {
    readonly inventory = new NativePilotInventoryRepository();
    readonly request: NativePilotWorkerRequest;
    readonly executeProcess: typeof spawnSync;
    constructor(request: NativePilotWorkerRequest, executeProcess: typeof spawnSync = spawnSync) {
        new NativePilotContractValidator().resolved(request.contract);
        new NativePilotContractValidator().selection(request.selection);
        requireContainer(
            request.schema_version === 1 &&
                /^[a-f0-9]{32}$/.test(request.nonce) &&
                request.account.home === `/home/${request.account.name}` &&
                request.account.uid >= 1000 &&
                request.account.gid >= 1000 &&
                Object.keys(request.expected).join(',') ===
                    'source_a,source_b,driver,observer,node,codex,claude,source,consumer' &&
                Object.values(request.expected).every((value) => /^[a-f0-9]{64}$/.test(value)),
            'Invalid fixed worker request.',
        );
        this.request = structuredClone(request);
        this.executeProcess = executeProcess;
    }

    static load(path: string) {
        requireContainer(
            path === containerPath.request,
            'Only the mounted fixed worker request is accepted.',
        );
        return new NativePilotContainerWorkerRepository(
            new NativePilotInventoryRepository().readJson(path) as NativePilotWorkerRequest,
        );
    }

    private account() {
        const actual = userInfo();
        requireContainer(
            process.platform === 'linux' &&
                process.getuid?.() === this.request.account.uid &&
                process.getgid?.() === this.request.account.gid &&
                actual.uid === this.request.account.uid &&
                actual.gid === this.request.account.gid &&
                actual.username === this.request.account.name &&
                actual.homedir === this.request.account.home &&
                process.env.HOME === actual.homedir &&
                !Object.prototype.hasOwnProperty.call(process.env, 'CODEX_HOME'),
            'Worker is outside its selected ordinary container account.',
        );
        return actual;
    }

    context() {
        const account = this.account();
        const npmKeys = Object.keys(NativePilotNpmEnvironmentRepository.additions);
        if (this.request.selection.host === 'claude')
            NativePilotNpmEnvironmentRepository.environment(process.env);
        requireContainer(
            process.execPath === containerPath.node &&
                process.versions.node === this.request.contract.binaries.node.version &&
                process.env.PATH === containerPath.path &&
                Object.keys(process.env).every((key) =>
                    [
                        'HOME',
                        'PATH',
                        'LANG',
                        'HOSTNAME',
                        'NODE_VERSION',
                        'YARN_VERSION',
                        ...(this.request.selection.host === 'claude' ? npmKeys : []),
                    ].includes(key),
                ),
            'Common worker context differs.',
        );
        return {
            account: {
                name: account.username,
                uid: account.uid,
                gid: account.gid,
                home: account.homedir,
            },
            node_version: process.versions.node,
            environment_names: Object.keys(process.env).sort(),
            hashes: this.hashes(),
        };
    }

    nativeEnvironment() {
        this.account();
        return this.request.selection.host === 'claude'
            ? new NativePilotNpmEnvironmentRepository().prepare(process.env)
            : { environment: undefined, evidence: null };
    }

    hashes() {
        const result: Record<string, string> = {};
        for (const name of Object.keys(this.request.expected)) {
            const binary = ['node', 'codex', 'claude'].includes(name);
            const path = binary
                ? `/pilot/runtime-bin/${name}`
                : ['source', 'consumer'].includes(name)
                  ? `/pilot/${name}`
                  : `/pilot/input/${name}`;
            result[name] = binary
                ? this.inventory.file(path, 536_870_912).sha256
                : this.inventory.tree(path).tree_sha256;
        }
        requireContainer(
            JSON.stringify(result) === JSON.stringify(this.request.expected),
            'Worker measured changed input bytes.',
        );
        return result;
    }

    /** Fixed phase/index selects a precomposed command; no executable, args or shell in input. */
    command(phase: string, index: number) {
        const step = new NativePilotPlanService()
            .plan(
                { root: containerPath.root, contract: this.request.contract },
                this.request.selection,
            )
            .find((step) => step.id === phase);
        requireContainer(
            step && Number.isSafeInteger(index) && index >= 0 && index < step.commands.length,
            'Unknown fixed phase command.',
        );
        return structuredClone(step!.commands[index]);
    }

    execute(phase: string, index: number) {
        this.context();
        const command = this.command(phase, index);
        const npm = this.nativeEnvironment();
        let childPid: number | null = null;
        const result = new NativePilotProcessRepository().run(
            command,
            containerPath.consumer,
            (executable, args, options) => {
                const raw = this.executeProcess(executable, args, {
                    ...options,
                    ...(npm.environment ? { env: npm.environment } : {}),
                });
                childPid = Number.isSafeInteger(raw.pid) && raw.pid >= 2 ? raw.pid : null;
                return {
                    ...raw,
                    error: raw.error
                        ? {
                              code: (raw.error as NodeJS.ErrnoException).code ?? 'EXECUTION_ERROR',
                          }
                        : undefined,
                };
            },
        );
        // The host controller kills the whole owned container on a failed/unknown process.
        // Killing just this child would not establish that its descendants have stopped.
        return {
            schema_version: 1,
            operation: 'execute',
            nonce: this.request.nonce,
            selection: this.request.selection,
            phase,
            index,
            command,
            process_identity: {
                schema_version: 1,
                worker_pid: process.pid,
                child_pid: childPid,
                executable: command.executable,
            },
            npm_environment: npm.evidence,
            ...result,
        };
    }

    private writeProbe(path: string) {
        const target = join(path, `.i9-confinement-${this.request.nonce}-${process.pid}`);
        let created = false;
        try {
            writeFileSync(target, 'bounded write probe\n', {
                flag: 'wx',
                mode: 0o600,
            });
            created = true;
            unlinkSync(target);
            return { path, created: true, removed: true, error: null };
        } catch (error) {
            if (created) {
                try {
                    unlinkSync(target);
                } catch {
                    /* Preserve unknown state in result. */
                }
            }
            return {
                path,
                created,
                removed: false,
                error:
                    typeof (error as NodeJS.ErrnoException).code === 'string'
                        ? (error as NodeJS.ErrnoException).code
                        : 'unknown',
            };
        }
    }

    private async externalConnect() {
        return await new Promise<string>((resolve) => {
            const socket = createConnection({ host: '192.0.2.1', port: 9 });
            let finished = false;
            const finish = (value: string) => {
                if (finished) return;
                finished = true;
                socket.destroy();
                resolve(value);
            };
            socket.setTimeout(1000, () => finish('timeout'));
            socket.once('connect', () => finish('connected'));
            socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code ?? 'unknown'));
        });
    }

    private present(path: string) {
        try {
            lstatSync(path);
            return true;
        } catch (error) {
            return (error as NodeJS.ErrnoException).code !== 'ENOENT';
        }
    }

    async probe(fresh: boolean) {
        const account = this.account();
        const status = readFileSync('/proc/self/status', 'utf8');
        const value = (name: string) =>
            status.match(new RegExp(`^${name}:\\s*(\\S+)`, 'm'))?.[1] ?? null;
        const routes = [
            ...readFileSync('/proc/net/route', 'utf8')
                .trim()
                .split('\n')
                .slice(1)
                .filter((line) => line.split(/\s+/)[0] !== 'lo'),
            ...readFileSync('/proc/net/ipv6_route', 'utf8')
                .trim()
                .split('\n')
                .filter((line) => line && line.trim().split(/\s+/).at(-1) !== 'lo'),
        ];
        const credentialPaths = [
            '.ssh',
            '.aws',
            '.azure',
            '.config/gcloud',
            '.codex/auth.json',
            '.claude/.credentials.json',
            '.netrc',
            '.npmrc',
            '.docker/config.json',
            '.git-credentials',
        ];
        return {
            schema_version: 1,
            operation: 'probe',
            nonce: this.request.nonce,
            selection: this.request.selection,
            platform: `${process.platform}/${process.arch === 'x64' ? 'amd64' : process.arch}`,
            node_executable: process.execPath,
            node_version: process.versions.node,
            uid: process.getuid!(),
            gid: process.getgid!(),
            passwd_name: account.username,
            passwd_home: account.homedir,
            home: process.env.HOME,
            environment: Object.entries(process.env)
                .map(([key, value]) => `${key}=${value}`)
                .sort(),
            no_new_privileges: Number(value('NoNewPrivs')),
            seccomp: Number(value('Seccomp')),
            capabilities: {
                effective: value('CapEff'),
                permitted: value('CapPrm'),
                bounding: value('CapBnd'),
            },
            cgroups: {
                memory_max: readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(),
                memory_swap_max: readFileSync('/sys/fs/cgroup/memory.swap.max', 'utf8').trim(),
                pids_max: readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(),
                cpu_max: readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim(),
            },
            namespaces: Object.fromEntries(
                ['pid', 'mnt', 'net', 'user', 'ipc', 'uts'].map((name) => [
                    name,
                    readlinkSync(`/proc/self/ns/${name}`),
                ]),
            ),
            interfaces: Object.keys(networkInterfaces()).sort(),
            routes,
            external_connect: await this.externalConnect(),
            hashes: this.hashes(),
            denied: [
                '/pilot/input',
                '/pilot/source',
                '/pilot/runtime-bin',
                '/pilot/consumer',
                '/pilot/control',
                '/var/tmp',
            ].map((path) => this.writeProbe(path)),
            writable: [
                account.homedir,
                '/pilot/state',
                '/pilot/work',
                '/pilot/native-output',
                '/tmp',
            ].map((path) => this.writeProbe(path)),
            sockets: [
                '/var/run/docker.sock',
                '/run/docker.sock',
                '/run/systemd/private',
                '/run/dbus/system_bus_socket',
            ].map((path) => ({ path, present: this.present(path) })),
            credential_paths: credentialPaths.filter((path) =>
                this.present(join(account.homedir, path)),
            ),
            // Use the same established tree formula as the independently retained
            // image-home seed. Do not re-classify a used native profile as a seed.
            home_seed_sha256: fresh ? this.inventory.tree(account.homedir).tree_sha256 : null,
        };
    }

    async audit() {
        this.account();
        return {
            schema_version: 1,
            operation: 'audit',
            nonce: this.request.nonce,
            selection: this.request.selection,
            ...(await new NativePilotProcessAuditRepository().audit(process.pid)),
        };
    }

    /** Bounded inert backup records, including link text; never follows or extracts a link. */
    snapshot(root: string, content: boolean): NativePilotRetainedEntry[] {
        this.inventory.canonicalDirectory(root);
        const entries: NativePilotRetainedEntry[] = [];
        let bytes = 0;
        const walk = (directory: string, prefix: string) => {
            const before = lstatSync(directory);
            const names = readdirSync(directory).sort();
            for (const name of names) {
                requireContainer(!/[\\\x00-\x1f\x7f]/.test(name), 'Unsupported retained filename.');
                const path = prefix ? `${prefix}/${name}` : name;
                const absolute = join(directory, name);
                const stat = lstatSync(absolute);
                requireContainer(
                    entries.length < containerLimits.retention_entries && path.length <= 4096,
                    'Retention inventory bound exceeded.',
                );
                if (stat.isDirectory()) {
                    entries.push({
                        path,
                        kind: 'directory',
                        bytes: 0,
                        sha256: null,
                        target: null,
                        base64: null,
                    });
                    walk(absolute, path);
                } else if (stat.isSymbolicLink()) {
                    const target = readlinkSync(absolute);
                    requireContainer(
                        stable(stat, lstatSync(absolute)),
                        'Retained symlink changed.',
                    );
                    entries.push({
                        path,
                        kind: 'symlink',
                        bytes: Buffer.byteLength(target),
                        sha256: pilotDigest(target),
                        target,
                        base64: null,
                    });
                } else {
                    requireContainer(
                        stat.isFile() &&
                            stat.nlink === 1 &&
                            stat.size <= containerLimits.retention_bytes - bytes,
                        'Unsupported or oversized retained file.',
                    );
                    const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
                    try {
                        requireContainer(
                            stable(stat, fstatSync(fd)),
                            'Retained file changed before read.',
                        );
                        const chunks: Buffer[] = [];
                        let total = 0;
                        for (;;) {
                            const chunk = Buffer.alloc(65_536);
                            const count = readSync(fd, chunk);
                            if (count === 0) break;
                            total += count;
                            requireContainer(
                                total <= containerLimits.retention_bytes - bytes,
                                'Retained file grew beyond its bound.',
                            );
                            chunks.push(chunk.subarray(0, count));
                        }
                        const buffer = Buffer.concat(chunks, total);
                        bytes += buffer.length;
                        requireContainer(
                            buffer.length === stat.size &&
                                bytes <= containerLimits.retention_bytes &&
                                stable(stat, fstatSync(fd)) &&
                                stable(stat, lstatSync(absolute)),
                            'Retained file changed or exceeded bound.',
                        );
                        entries.push({
                            path,
                            kind: 'file',
                            bytes: buffer.length,
                            sha256: pilotDigest(buffer),
                            target: null,
                            base64: content ? buffer.toString('base64') : null,
                        });
                    } finally {
                        closeSync(fd);
                    }
                }
            }
            requireContainer(
                stable(before, lstatSync(directory)) &&
                    JSON.stringify(names) === JSON.stringify(readdirSync(directory).sort()),
                'Retained directory changed.',
            );
        };
        walk(root, '');
        return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    }

    async export() {
        this.account();
        this.hashes();
        const audit = await this.audit();
        requireContainer(
            audit.quiescent && NativePilotProcessAuditRepository.settled(audit.samples),
            'Native processes or listeners remain; retention snapshot is not quiescent.',
        );
        const roots = ['home', 'state', 'work', 'native-output'].map((name) => {
            const path = name === 'home' ? this.request.account.home : `/pilot/${name}`;
            return { name, path, entries: this.snapshot(path, true) };
        });
        const entries = roots.flatMap((root) => root.entries);
        requireContainer(
            entries.length <= containerLimits.retention_entries &&
                entries.reduce((sum, entry) => sum + entry.bytes, 0) <=
                    containerLimits.retention_bytes,
            'Combined retention bound exceeded.',
        );
        this.hashes();
        return {
            schema_version: 1,
            operation: 'export',
            audit,
            nonce: this.request.nonce,
            selection: this.request.selection,
            roots,
        };
    }
}
