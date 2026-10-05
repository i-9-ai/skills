// SPDX-License-Identifier: Apache-2.0
import { openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { containerPath, requireContainer } from '../validator/NativePilotContainerValidator.ts';

export interface NativePilotProcessEntry {
    pid: number;
    ppid: number | null;
    start_ticks: string | null;
    state: string | null;
    comm: string | null;
    argv: string[] | null;
    role: 'init' | 'idle' | 'worker' | 'unexpected';
    observation: 'observed' | 'disappeared' | 'unreadable' | 'over-bound' | 'changed' | 'invalid';
    failure?: NativePilotProcessFailure;
}
interface NativePilotProcessFailure {
    stage: 'stat-before' | 'cmdline' | 'stat-after';
    condition:
        'read' | 'utf8' | 'stat-shape' | 'parent-identity' | 'command-name-bound' | 'argv-bound';
    code: 'ENOENT' | 'EOVERFLOW' | 'EACCES' | 'EPERM' | 'invalid';
    fields: {
        field: 'stat-before' | 'cmdline' | 'stat-after';
        read_bytes: number;
        read_complete: boolean;
        sha256: string;
        base64: string | null;
        retention: 'complete' | 'budget-omitted';
    }[];
}
interface ProcWitness {
    field: NativePilotProcessFailure['stage'];
    bytes: Buffer;
    complete: boolean;
}
export interface NativePilotProcessSample {
    worker_pid: number;
    processes: NativePilotProcessEntry[];
    network_observation: 'observed' | 'unreadable' | 'over-bound';
    network_contract: 'linux-proc-inet-v1';
    sockets: NativePilotSocketEntry[];
    listeners: NativePilotSocketEntry[];
    closed_time_wait: NativePilotSocketEntry[];
    blocking_sockets: NativePilotSocketEntry[];
}
export interface NativePilotSocketEntry {
    table: string;
    local: string;
    remote: string;
    state: string;
    inode: string;
}
export interface NativePilotProcReader {
    ids(): string[];
    read(path: string, limit: number): Buffer;
}

const text = (bytes: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const clean = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, '?');
const boundedRead = (path: string, limit: number) => {
    requireContainer(
        /^(?:[1-9]\d{0,7}\/(?:stat|cmdline)|net\/(?:tcp|tcp6|udp|udp6))$/.test(path),
        'Unknown proc field.',
    );
    const fd = openSync(`/proc/${path}`, 'r');
    try {
        const bytes = Buffer.alloc(limit + 1);
        let used = 0;
        while (used < bytes.length) {
            const count = readSync(fd, bytes, used, bytes.length - used, null);
            if (!count) break;
            used += count;
        }
        if (used > limit)
            throw Object.assign(new Error('Proc field exceeded bound.'), {
                code: 'EOVERFLOW',
                proc_bytes: bytes.subarray(0, used),
            });
        return bytes.subarray(0, used);
    } finally {
        closeSync(fd);
    }
};

/** Fixed read-only proc inventory. Injected readers/sleep are used only by fake tests. */
export class NativePilotProcessAuditRepository {
    readonly reader: NativePilotProcReader;
    readonly pause: (ms: number) => Promise<void>;
    constructor(
        reader: NativePilotProcReader = {
            ids: () => readdirSync('/proc').filter((name) => /^\d+$/.test(name)),
            read: boundedRead,
        },
        pause: (ms: number) => Promise<void> = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms)),
    ) {
        this.reader = reader;
        this.pause = pause;
    }

    private stat(
        id: number,
        raw: Buffer,
        condition: (value: NativePilotProcessFailure['condition']) => void,
    ) {
        condition('utf8');
        const value = text(raw);
        const open = value.indexOf('(');
        const close = value.lastIndexOf(')');
        const fields = value
            .slice(close + 2)
            .trim()
            .split(/\s+/);
        condition('stat-shape');
        requireContainer(
            open > 0 &&
                close > open &&
                Number(value.slice(0, open).trim()) === id &&
                fields.length >= 20 &&
                /^[A-Za-z]$/.test(fields[0]) &&
                /^\d+$/.test(fields[1]) &&
                /^\d{1,20}$/.test(fields[19]),
            'Invalid proc stat.',
        );
        const ppid = Number(fields[1]);
        condition('parent-identity');
        requireContainer(Number.isSafeInteger(ppid) && ppid >= 0, 'Invalid parent identity.');
        const comm = clean(value.slice(open + 1, close));
        condition('command-name-bound');
        requireContainer(comm.length <= 128, 'Process command name exceeded bound.');
        return {
            ppid,
            start_ticks: fields[19],
            state: fields[0],
            comm,
        };
    }

    static role(
        pid: number,
        ppid: number | null,
        argv: string[] | null,
        worker: number,
    ): NativePilotProcessEntry['role'] {
        if (!argv) return 'unexpected';
        const node =
            argv[0] === containerPath.node &&
            argv[1] === containerPath.worker &&
            argv[3] === containerPath.request &&
            argv.length === 4;
        return pid === 1 &&
            ppid === 0 &&
            ['/sbin/docker-init', '/usr/bin/docker-init'].includes(argv[0])
            ? 'init'
            : node && ppid === 1 && argv[2] === 'idle'
              ? 'idle'
              : node && pid === worker && ['audit', 'export'].includes(argv[2])
                ? 'worker'
                : 'unexpected';
    }

    sample(worker: number, witnessBudget = { remaining: 16_384 }): NativePilotProcessSample {
        const ids = this.reader.ids();
        requireContainer(
            ids.length <= 264 &&
                ids.every((id) => /^[1-9]\d{0,7}$/.test(id)) &&
                new Set(ids).size === ids.length,
            'Process inventory bound or identity differs.',
        );
        let bytes = 0;
        const processes = ids
            .sort((a, b) => Number(a) - Number(b))
            .map((id): NativePilotProcessEntry => {
                const pid = Number(id);
                let result: NativePilotProcessEntry = {
                    pid,
                    ppid: null,
                    start_ticks: null,
                    state: null,
                    comm: null,
                    argv: null,
                    role: 'unexpected',
                    observation: 'unreadable',
                };
                let stage: NativePilotProcessFailure['stage'] = 'stat-before';
                let condition: NativePilotProcessFailure['condition'] = 'read';
                const witnesses: ProcWitness[] = [];
                const read = (field: NativePilotProcessFailure['stage']) => {
                    stage = field;
                    condition = 'read';
                    try {
                        const raw = this.reader.read(
                            `${pid}/${field === 'cmdline' ? 'cmdline' : 'stat'}`,
                            4096,
                        );
                        requireContainer(Buffer.isBuffer(raw), 'Proc reader returned non-bytes.');
                        const complete = raw.length <= 4096;
                        witnesses.push({ field, bytes: raw.subarray(0, 4097), complete });
                        if (!complete)
                            throw Object.assign(new Error('Proc field exceeded bound.'), {
                                code: 'EOVERFLOW',
                            });
                        return raw;
                    } catch (error) {
                        const raw = (error as { proc_bytes?: unknown }).proc_bytes;
                        if (Buffer.isBuffer(raw))
                            witnesses.push({
                                field,
                                bytes: raw.subarray(0, 4097),
                                complete: false,
                            });
                        throw error;
                    }
                };
                try {
                    const before = this.stat(pid, read('stat-before'), (value) => {
                        condition = value;
                    });
                    result = { ...result, ...before };
                    const raw = read('cmdline');
                    condition = 'utf8';
                    const argv = text(raw).split('\0');
                    if (argv.at(-1) === '') argv.pop();
                    condition = 'argv-bound';
                    requireContainer(
                        argv.length <= 32 && argv.every((arg) => arg.length <= 1024),
                        'Invalid bounded argv.',
                    );
                    const after = this.stat(pid, read('stat-after'), (value) => {
                        condition = value;
                    });
                    if (
                        before.ppid !== after.ppid ||
                        before.start_ticks !== after.start_ticks ||
                        before.comm !== after.comm
                    )
                        result = { ...result, ...after, observation: 'changed' };
                    else {
                        const normalized = argv.map(clean);
                        result = {
                            pid,
                            ...after,
                            argv: normalized,
                            role: NativePilotProcessAuditRepository.role(
                                pid,
                                after.ppid,
                                normalized,
                                worker,
                            ),
                            observation: 'observed',
                        };
                    }
                } catch (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    result.observation =
                        code === 'ENOENT'
                            ? 'disappeared'
                            : code === 'EOVERFLOW'
                              ? 'over-bound'
                              : code === 'EACCES' || code === 'EPERM'
                                ? 'unreadable'
                                : 'invalid';
                    result.failure = {
                        stage,
                        condition,
                        code: ['ENOENT', 'EOVERFLOW', 'EACCES', 'EPERM'].includes(code ?? '')
                            ? (code as NativePilotProcessFailure['code'])
                            : 'invalid',
                        fields: witnesses.map(({ field, bytes: raw, complete }) => {
                            const retain = raw.length <= witnessBudget.remaining;
                            if (retain) witnessBudget.remaining -= raw.length;
                            return {
                                field,
                                read_bytes: raw.length,
                                read_complete: complete,
                                sha256: createHash('sha256').update(raw).digest('hex'),
                                base64: retain ? raw.toString('base64') : null,
                                retention: retain ? 'complete' : 'budget-omitted',
                            };
                        }),
                    };
                }
                bytes += Buffer.byteLength(JSON.stringify(result));
                if (bytes > 131_072)
                    result = {
                        pid,
                        ppid: null,
                        start_ticks: null,
                        state: null,
                        comm: null,
                        argv: null,
                        role: 'unexpected',
                        observation: 'over-bound',
                    };
                return result;
            });
        const sockets: NativePilotSocketEntry[] = [];
        let network_observation: NativePilotProcessSample['network_observation'] = 'observed';
        try {
            for (const table of ['tcp', 'tcp6', 'udp', 'udp6']) {
                const raw = text(this.reader.read(`net/${table}`, 16_384));
                requireContainer(raw.endsWith('\n'), 'Incomplete socket table.');
                const lines = raw.split('\n');
                const header = lines.shift()!.trim().split(/\s+/).join(' ');
                requireContainer(
                    /^sl local_address (?:rem_address|remote_address) st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode(?: ref pointer drops)?$/.test(
                        header,
                    ),
                    'Unrecognized socket table header.',
                );
                const rows = lines.filter((line) => line.trim());
                requireContainer(rows.length <= 256, 'Socket table exceeded bound.');
                for (const line of rows) {
                    const fields = line.trim().split(/\s+/);
                    requireContainer(
                        fields.length >= 10 &&
                            /^\d+:$/.test(fields[0]) &&
                            /^[A-Fa-f0-9]+:[A-Fa-f0-9]{4}$/.test(fields[1] ?? '') &&
                            /^[A-Fa-f0-9]+:[A-Fa-f0-9]{4}$/.test(fields[2] ?? '') &&
                            /^[A-Fa-f0-9]{2}$/.test(fields[3] ?? '') &&
                            /^[A-Fa-f0-9]{8}:[A-Fa-f0-9]{8}$/.test(fields[4] ?? '') &&
                            /^[A-Fa-f0-9]{2}:[A-Fa-f0-9]{8}$/.test(fields[5] ?? '') &&
                            /^[A-Fa-f0-9]{8}$/.test(fields[6] ?? '') &&
                            fields.slice(7, 10).every((value) => /^\d+$/.test(value)),
                        'Unknown socket row.',
                    );
                    sockets.push({
                        table,
                        local: fields[1].toUpperCase(),
                        remote: fields[2].toUpperCase(),
                        state: fields[3].toUpperCase(),
                        inode: fields[9],
                    });
                }
            }
        } catch (error) {
            network_observation =
                (error as NodeJS.ErrnoException).code === 'EOVERFLOW' ? 'over-bound' : 'unreadable';
        }
        return {
            worker_pid: worker,
            processes,
            network_observation,
            network_contract: 'linux-proc-inet-v1',
            sockets,
            ...NativePilotProcessAuditRepository.socketClasses(sockets),
        };
    }

    static socketClasses(sockets: NativePilotSocketEntry[]) {
        // Linux proc inet ABI: TCP_LISTEN=10 and TCP_TIME_WAIT=6. The
        // kernel emits inode zero for its time-wait records; retain them.
        const tcp = (p: NativePilotSocketEntry) => p.table === 'tcp' || p.table === 'tcp6';
        const closed = (p: NativePilotSocketEntry) => tcp(p) && p.state === '06' && p.inode === '0';
        return {
            listeners: sockets.filter((p) => tcp(p) && p.state === '0A'),
            closed_time_wait: sockets.filter(closed),
            blocking_sockets: sockets.filter((p) => !closed(p)),
        };
    }

    static networkQuiescent(sample: NativePilotProcessSample) {
        if (
            sample.network_contract !== 'linux-proc-inet-v1' ||
            sample.network_observation !== 'observed' ||
            !Array.isArray(sample.sockets) ||
            sample.sockets.length > 1024
        )
            return false;
        for (const row of sample.sockets) {
            if (
                !row ||
                !['tcp', 'tcp6', 'udp', 'udp6'].includes(row.table) ||
                !/^[A-F0-9]{2}$/.test(row.state) ||
                !/^\d{1,20}$/.test(row.inode)
            )
                return false;
            const length = row.table.endsWith('6') ? 32 : 8;
            const address = new RegExp(`^[A-F0-9]{${length}}:[A-F0-9]{4}$`);
            if (!address.test(row.local) || !address.test(row.remote)) return false;
        }
        const expected = NativePilotProcessAuditRepository.socketClasses(sample.sockets);
        return (
            expected.blocking_sockets.length === 0 &&
            JSON.stringify(sample.listeners) === JSON.stringify(expected.listeners) &&
            JSON.stringify(sample.closed_time_wait) === JSON.stringify(expected.closed_time_wait) &&
            JSON.stringify(sample.blocking_sockets) === JSON.stringify(expected.blocking_sockets)
        );
    }

    static settled(samples: NativePilotProcessSample[]) {
        if (samples.length < 2 || samples.length > 5) return false;
        const last = samples.slice(-2);
        for (const sample of last) {
            if (
                !sample ||
                !Number.isSafeInteger(sample.worker_pid) ||
                sample.worker_pid <= 1 ||
                !Array.isArray(sample.processes) ||
                sample.processes.length > 264 ||
                !NativePilotProcessAuditRepository.networkQuiescent(sample)
            )
                return false;
            if (new Set(sample.processes.map((p) => p.pid)).size !== sample.processes.length)
                return false;
            for (const p of sample.processes) {
                if (
                    !Number.isSafeInteger(p.pid) ||
                    p.pid < 1 ||
                    !Number.isSafeInteger(p.ppid) ||
                    p.ppid! < 0 ||
                    typeof p.start_ticks !== 'string' ||
                    !/^\d{1,20}$/.test(p.start_ticks) ||
                    p.observation !== 'observed' ||
                    p.failure !== undefined ||
                    typeof p.comm !== 'string' ||
                    p.comm.length > 128 ||
                    !Array.isArray(p.argv) ||
                    p.argv.length > 32 ||
                    p.argv.some((arg) => typeof arg !== 'string' || arg.length > 1024) ||
                    p.role !==
                        NativePilotProcessAuditRepository.role(
                            p.pid,
                            p.ppid,
                            p.argv,
                            sample.worker_pid,
                        )
                )
                    return false;
                if (
                    p.role === 'unexpected'
                        ? p.state !== 'Z'
                        : !['R', 'S', 'I'].includes(p.state ?? '')
                )
                    return false;
            }
            if (
                !['init', 'idle', 'worker'].every(
                    (role) => sample.processes.filter((p) => p.role === role).length === 1,
                )
            )
                return false;
        }
        const identities = (sample: NativePilotProcessSample) =>
            sample.processes
                .map(
                    (p) =>
                        `${p.pid}/${p.ppid}/${p.start_ticks}/${p.role}/${p.role === 'unexpected' ? p.state : 'live'}`,
                )
                .sort();
        return JSON.stringify(identities(last[0])) === JSON.stringify(identities(last[1]));
    }

    static zombies(sample: NativePilotProcessSample) {
        return sample.processes
            .filter(
                (p) => p.observation === 'observed' && p.role === 'unexpected' && p.state === 'Z',
            )
            .map(({ pid, ppid, start_ticks, state, comm }) => ({
                pid,
                ppid,
                start_ticks,
                state,
                comm,
            }));
    }

    static quiescent(value: any) {
        if (!value || !Array.isArray(value.samples) || value.quiescent !== true) return false;
        if (!NativePilotProcessAuditRepository.settled(value.samples)) return false;
        const last = value.samples.at(-1) as NativePilotProcessSample;
        const zombies = NativePilotProcessAuditRepository.zombies(last);
        return (
            JSON.stringify(value.processes) === JSON.stringify(last.processes) &&
            JSON.stringify(value.listeners) === JSON.stringify(last.listeners) &&
            JSON.stringify(value.sockets) === JSON.stringify(last.sockets) &&
            JSON.stringify(value.closed_time_wait) === JSON.stringify(last.closed_time_wait) &&
            JSON.stringify(value.blocking_sockets) === JSON.stringify(last.blocking_sockets) &&
            value.network_contract === 'linux-proc-inet-v1' &&
            value.worker_pid === last.worker_pid &&
            value.network_observation === 'observed' &&
            value.status === (zombies.length ? 'quiescent-with-observed-zombies' : 'quiescent') &&
            JSON.stringify(value.residual_zombies) === JSON.stringify(zombies)
        );
    }

    async audit(worker: number) {
        const samples: NativePilotProcessSample[] = [];
        const witnessBudget = { remaining: 16_384 };
        for (let attempt = 0; attempt < 5; attempt++) {
            if (attempt) await this.pause(100);
            samples.push(this.sample(worker, witnessBudget));
            if (NativePilotProcessAuditRepository.settled(samples)) break;
        }
        const last = samples.at(-1)!;
        const quiescent = NativePilotProcessAuditRepository.settled(samples);
        return {
            ...last,
            samples,
            quiescent,
            status: quiescent
                ? last.processes.some((p) => p.role === 'unexpected')
                    ? 'quiescent-with-observed-zombies'
                    : 'quiescent'
                : 'blocked',
            residual_zombies: NativePilotProcessAuditRepository.zombies(last),
        };
    }
}
