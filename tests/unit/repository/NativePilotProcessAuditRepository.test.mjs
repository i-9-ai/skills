import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NativePilotProcessAuditRepository } from '../../../src/repository/NativePilotProcessAuditRepository.ts';
import { containerPath } from '../../../src/validator/NativePilotContainerValidator.ts';

const socketHeader =
    'sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n';
const socketRow =
    '0: 0100007F:1234 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 12345\n';

const normal = () => [
    {
        pid: 1,
        ppid: 0,
        start: '1',
        state: 'S',
        comm: 'docker-init',
        argv: ['/sbin/docker-init', '--'],
    },
    {
        pid: 7,
        ppid: 1,
        start: '2',
        state: 'S',
        comm: 'node',
        argv: [containerPath.node, containerPath.worker, 'idle', containerPath.request],
    },
    {
        pid: 22,
        ppid: 0,
        start: '3',
        state: 'R',
        comm: 'node',
        argv: [containerPath.node, containerPath.worker, 'audit', containerPath.request],
    },
];
const extra = (state = 'S') => ({
    pid: 90,
    ppid: 1,
    start: '3652952',
    state,
    comm: 'native-child',
    argv: state === 'Z' ? [] : ['/pilot/runtime-bin/claude', 'fixed-synthetic-call'],
});
const stat = (p) => {
    const fields = Array(20).fill('0');
    fields[0] = p.state;
    fields[1] = String(p.ppid);
    fields[19] = p.start;
    return Buffer.from(`${p.pid} (${p.comm}) ${fields.join(' ')}\n`);
};

test('rejected UTF-8 cmdline retains exact bounded bytes and observed stat without classifying the process', async () => {
    const raw = Buffer.from([0x63, 0xff, 0, 0x61]);
    const f = proc([[...normal(), extra('Z')]], {
        read: (path) => (path === '90/cmdline' ? raw : undefined),
    });
    const result = await f.repository.audit(22);
    const rejected = result.processes.at(-1);
    assert.equal(result.status, 'blocked');
    assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
    assert.equal(rejected.observation, 'invalid');
    assert.equal(rejected.state, 'Z');
    assert.equal(rejected.start_ticks, '3652952');
    assert.equal(rejected.argv, null);
    assert.deepEqual(result.residual_zombies, []);
    assert.equal(rejected.failure.stage, 'cmdline');
    assert.equal(rejected.failure.condition, 'utf8');
    const witness = rejected.failure.fields.at(-1);
    assert.equal(witness.read_complete, true);
    assert.equal(witness.read_bytes, raw.length);
    assert.equal(witness.sha256, createHash('sha256').update(raw).digest('hex'));
    assert.deepEqual(Buffer.from(witness.base64, 'base64'), raw);
});

test('invalid argv bound and malformed stat are distinguishable without raw error text', async () => {
    for (const [field, raw, condition] of [
        ['cmdline', Buffer.from('a'.repeat(1025) + '\0'), 'argv-bound'],
        ['stat', Buffer.from('malformed stat\n'), 'stat-shape'],
    ]) {
        const result = await proc([[...normal(), extra()]], {
            read: (path) => (path === `90/${field}` ? raw : undefined),
        }).repository.audit(22);
        const rejected = result.processes.at(-1);
        assert.equal(result.status, 'blocked');
        assert.equal(rejected.failure.condition, condition);
        assert.equal(rejected.failure.code, 'invalid');
        assert.deepEqual(Buffer.from(rejected.failure.fields.at(-1).base64, 'base64'), raw);
    }
});

test('read failure retains only the closed error code and preceding bounded bytes', async () => {
    const result = await proc([[...normal(), extra()]], {
        read: (path) => {
            if (path === '90/cmdline')
                throw Object.assign(new Error('DO NOT COPY RAW ERROR PATH'), { code: 'EACCES' });
        },
    }).repository.audit(22);
    const rejected = result.processes.at(-1);
    assert.equal(rejected.observation, 'unreadable');
    assert.equal(rejected.failure.stage, 'cmdline');
    assert.equal(rejected.failure.condition, 'read');
    assert.equal(rejected.failure.code, 'EACCES');
    assert.equal(rejected.failure.fields.length, 1);
    assert.equal(rejected.failure.fields[0].field, 'stat-before');
    assert.equal(JSON.stringify(result).includes('DO NOT COPY'), false);
});

test('over-bound read retains only the measured prefix and labels it incomplete', async () => {
    const raw = Buffer.alloc(4097, 0x41);
    const result = await proc([[...normal(), extra()]], {
        read: (path) => {
            if (path === '90/cmdline')
                throw Object.assign(new Error('bound'), { code: 'EOVERFLOW', proc_bytes: raw });
        },
    }).repository.audit(22);
    const witness = result.samples[0].processes.at(-1).failure.fields.at(-1);
    assert.equal(witness.read_complete, false);
    assert.equal(witness.read_bytes, 4097);
    assert.deepEqual(Buffer.from(witness.base64, 'base64'), raw);
    assert.equal(result.status, 'blocked');
});

test('all rejected byte witnesses share one bounded audit budget and unknown processes remain present', async () => {
    const extras = Array.from({ length: 32 }, (_, index) => ({ ...extra(), pid: 90 + index }));
    const result = await proc([[...normal(), ...extras]], {
        read: (path) =>
            Number(path.split('/')[0]) >= 90 && path.endsWith('/cmdline')
                ? Buffer.alloc(4096, 0xff)
                : undefined,
    }).repository.audit(22);
    const witnesses = result.samples.flatMap((s) =>
        s.processes.flatMap((p) => p.failure?.fields ?? []),
    );
    const retained = witnesses.reduce(
        (total, w) => total + (w.base64 === null ? 0 : Buffer.from(w.base64, 'base64').length),
        0,
    );
    assert(retained <= 16_384);
    assert(witnesses.some((w) => w.retention === 'budget-omitted' && w.base64 === null));
    assert.equal(result.processes.length, 35);
    assert.equal(result.status, 'blocked');
    assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
});

test('a supplied failure witness cannot accompany a passing process observation', async () => {
    const result = await proc([normal()]).repository.audit(22);
    for (const sample of result.samples)
        sample.processes[0].failure = {
            stage: 'cmdline',
            condition: 'utf8',
            code: 'invalid',
            fields: [],
        };
    result.processes = structuredClone(result.samples.at(-1).processes);
    assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
});
const proc = (samples, options = {}) => {
    let sample = 0;
    const reads = [];
    const sleeps = [];
    const current = () => samples[Math.min(sample, samples.length - 1)];
    const repository = new NativePilotProcessAuditRepository(
        {
            ids: () => current().map((p) => String(p.pid)),
            read: (path, limit) => {
                reads.push(path);
                if (options.read) {
                    const output = options.read(path, sample, reads);
                    if (output !== undefined) return output;
                }
                const [id, field] = path.split('/');
                const p = current().find((item) => item.pid === Number(id));
                const value =
                    id === 'net'
                        ? Buffer.from(socketHeader)
                        : field === 'stat'
                          ? stat(p)
                          : Buffer.from(p.argv.length ? `${p.argv.join('\0')}\0` : '');
                if (value.length > limit)
                    throw Object.assign(new Error('synthetic bound'), {
                        code: 'EOVERFLOW',
                    });
                return value;
            },
        },
        async (ms) => {
            sleeps.push(ms);
            sample++;
        },
    );
    return { repository, reads, sleeps };
};

test('two complete independent fake samples identify the actual three fixed roles', async () => {
    const f = proc([normal()]);
    const result = await f.repository.audit(22);
    assert.equal(result.status, 'quiescent');
    assert.equal(result.samples.length, 2);
    assert.deepEqual(f.sleeps, [100]);
    assert.deepEqual(
        result.processes.map((p) => p.role),
        ['init', 'idle', 'worker'],
    );
    assert(NativePilotProcessAuditRepository.quiescent(result));
    assert.equal(f.reads.filter((path) => path === '22/stat').length, 4);
});

test('observed shutdown lag is retained and needs two subsequent clean samples', async () => {
    const f = proc([[...normal(), extra()], normal(), normal()]);
    const result = await f.repository.audit(22);
    assert.equal(result.samples.length, 3);
    assert.equal(result.samples[0].processes.at(-1).state, 'S');
    assert.deepEqual(result.samples[0].processes.at(-1).argv, [
        '/pilot/runtime-bin/claude',
        'fixed-synthetic-call',
    ]);
    assert.equal(result.status, 'quiescent');
    assert.deepEqual(f.sleeps, [100, 100]);
});

test('stable observed zombies remain explicit non-live residuals, never absent', async () => {
    const f = proc([[...normal(), extra('Z')]]);
    const result = await f.repository.audit(22);
    assert.equal(result.status, 'quiescent-with-observed-zombies');
    assert.equal(result.samples.length, 2);
    assert.deepEqual(result.residual_zombies, [
        {
            pid: 90,
            ppid: 1,
            start_ticks: '3652952',
            state: 'Z',
            comm: 'native-child',
        },
    ]);
    assert.equal(result.processes.length, 4);
    assert(NativePilotProcessAuditRepository.quiescent(result));
    result.residual_zombies = [];
    assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
});

for (const state of ['S', 'R', 'D', 'T', 'X', 'Q'])
    test(`persistent unexpected ${state} process exhausts five samples without absence`, async () => {
        const f = proc([[...normal(), extra(state)]]);
        const result = await f.repository.audit(22);
        assert.equal(result.status, 'blocked');
        assert.equal(result.quiescent, false);
        assert.equal(result.samples.length, 5);
        assert.deepEqual(f.sleeps, [100, 100, 100, 100]);
        assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
    });

for (const [code, classification] of [
    ['ENOENT', 'disappeared'],
    ['EACCES', 'unreadable'],
    ['EOVERFLOW', 'over-bound'],
])
    test(`persistent ${classification} PID cannot be discarded`, async () => {
        const f = proc([[...normal(), extra()]], {
            read: (path) => {
                if (path === '90/stat')
                    throw Object.assign(new Error('synthetic read failure'), { code });
            },
        });
        const result = await f.repository.audit(22);
        assert.equal(result.status, 'blocked');
        assert.equal(result.processes.at(-1).observation, classification);
        assert.equal(result.samples.length, 5);
    });

test('a raced disappeared PID may clear only after two fresh complete inventories', async () => {
    const f = proc([[...normal(), extra()], normal(), normal()], {
        read: (path, sample) => {
            if (!sample && path === '90/cmdline')
                throw Object.assign(new Error('synthetic disappearance'), {
                    code: 'ENOENT',
                });
        },
    });
    const result = await f.repository.audit(22);
    assert.equal(result.samples[0].processes.at(-1).observation, 'disappeared');
    assert.equal(result.samples.length, 3);
    assert.equal(result.status, 'quiescent');
});

test('PID reuse is not a stable pair; only later equal measured identities settle', async () => {
    const first = [...normal(), extra('Z')];
    const next = structuredClone(first);
    next.at(-1).start = '3652953';
    const result = await proc([first, next, next]).repository.audit(22);
    assert.equal(result.samples.length, 3);
    assert.equal(result.residual_zombies[0].start_ticks, '3652953');
});

test('identity changing during one stat/cmdline/stat read remains unknown', async () => {
    let reads = 0;
    const f = proc([[...normal(), extra('Z')]], {
        read: (path) => {
            if (path === '90/stat') return stat({ ...extra('Z'), start: String(++reads) });
        },
    });
    const result = await f.repository.audit(22);
    assert.equal(result.status, 'blocked');
    assert.equal(result.processes.at(-1).observation, 'changed');
});

test('command details are normalized and over-bound names fail closed without truncation', async () => {
    const p = extra();
    p.comm = 'native\nchild';
    p.argv = ['synthetic\targument'];
    const normalized = await proc([[...normal(), p]]).repository.audit(22);
    assert.equal(normalized.processes.at(-1).comm, 'native?child');
    assert.deepEqual(normalized.processes.at(-1).argv, ['synthetic?argument']);
    p.comm = 'x'.repeat(129);
    const exceeded = await proc([[...normal(), p]]).repository.audit(22);
    assert.equal(exceeded.status, 'blocked');
    assert.equal(exceeded.processes.at(-1).observation, 'invalid');
    assert.equal(exceeded.processes.at(-1).comm, null);
});

test('malformed UTF-8 argv and oversized process arguments retain an unknown process', async () => {
    for (const bytes of [Buffer.from([0xff]), Buffer.alloc(4097, 65)]) {
        const f = proc([[...normal(), extra()]], {
            read: (path) => {
                if (path === '90/cmdline') {
                    if (bytes.length > 4096)
                        throw Object.assign(new Error('bound'), { code: 'EOVERFLOW' });
                    return bytes;
                }
            },
        });
        const result = await f.repository.audit(22);
        assert.equal(result.status, 'blocked');
        assert.notEqual(result.processes.at(-1).observation, 'observed');
    }
});

test('unknown socket inventory or actual socket rows prevent quiescence', async () => {
    for (const mode of ['unreadable', 'socket']) {
        const f = proc([normal()], {
            read: (path) => {
                if (path === 'net/tcp') {
                    if (mode === 'unreadable')
                        throw Object.assign(new Error('synthetic unavailable table'), {
                            code: 'EACCES',
                        });
                    return Buffer.from(socketHeader + socketRow);
                }
            },
        });
        const result = await f.repository.audit(22);
        assert.equal(result.status, 'blocked');
        if (mode === 'socket')
            assert.deepEqual(result.listeners, [
                {
                    table: 'tcp',
                    local: '0100007F:1234',
                    remote: '00000000:0000',
                    state: '0A',
                    inode: '12345',
                },
            ]);
        else assert.equal(result.network_observation, 'unreadable');
    }
});

test('forged role or final summary cannot convert an unknown PID into absence', async () => {
    const result = await proc([normal()]).repository.audit(22);
    const spoofed = structuredClone(result);
    for (const sample of spoofed.samples)
        sample.processes[1].argv = ['/bin/sh', '-c', 'synthetic inert argument'];
    spoofed.processes = structuredClone(spoofed.samples.at(-1).processes);
    assert.equal(NativePilotProcessAuditRepository.quiescent(spoofed), false);
    result.processes = result.processes.slice(0, 2);
    assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
});

for (const [label, raw] of Object.entries({
    empty: '',
    whitespace: '\n',
    unknown: 'unrecognized socket output\n',
    'short-header': 'sl local_address rem_address st\n',
    'truncated-header': socketHeader.trimEnd(),
    'truncated-row': socketHeader + socketRow.trimEnd(),
    'short-row': socketHeader + '0: 0100007F:1234 00000000:0000 0A\n',
    'malformed-row': socketHeader + socketRow.replace('1000 0 12345', 'unknown 0 12345'),
}))
    test(`${label} network table is unreadable and never observed socket absence`, async () => {
        const f = proc([normal()], {
            read: (path) => {
                if (path.startsWith('net/')) return Buffer.from(raw);
            },
        });
        const result = await f.repository.audit(22);
        assert.equal(result.status, 'blocked');
        assert.equal(result.network_observation, 'unreadable');
        assert.equal(result.samples.length, 5);
        assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
    });

test('recognized Linux IPv6/UDP header variants can measure an actually empty table', async () => {
    const f = proc([normal()], {
        read: (path) => {
            if (path === 'net/tcp6')
                return Buffer.from(socketHeader.replace('rem_address', 'remote_address'));
            if (path === 'net/udp' || path === 'net/udp6')
                return Buffer.from(socketHeader.trimEnd() + ' ref pointer drops\n');
        },
    });
    const result = await f.repository.audit(22);
    assert.equal(result.status, 'quiescent');
    assert.equal(result.network_observation, 'observed');
});

for (const table of ['tcp', 'tcp6'])
    test(`closed ${table} TIME_WAIT inode-zero rows remain explicit without becoming listeners`, async () => {
        const address = table === 'tcp' ? '0100007F' : '00000000000000000000000001000000';
        const row = `0: ${address}:1234 ${address}:4321 06 00000000:00000000 03:00000010 00000000 0 0 0 1 0000000000000000\n`;
        const f = proc([normal()], {
            read: (path) => (path === `net/${table}` ? Buffer.from(socketHeader + row) : undefined),
        });
        const result = await f.repository.audit(22);
        assert.equal(result.status, 'quiescent');
        assert.equal(result.sockets.length, 1);
        assert.equal(result.closed_time_wait.length, 1);
        assert.equal(result.closed_time_wait[0].state, '06');
        assert.equal(result.closed_time_wait[0].inode, '0');
        assert.deepEqual(result.listeners, []);
        assert.deepEqual(result.blocking_sockets, []);
        assert(NativePilotProcessAuditRepository.quiescent(result));
        result.closed_time_wait = [];
        assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
    });

for (const [label, table, state, inode] of [
    ['listener', 'tcp', '0A', '1'],
    ['established', 'tcp', '01', '1'],
    ['unknown-state', 'tcp', 'FF', '0'],
    ['inode-positive-time-wait', 'tcp', '06', '1'],
    ['udp', 'udp', '07', '1'],
    ['udp-resembling-tcp-time-wait', 'udp', '06', '0'],
])
    test(`${label} socket remains blocking with full retained state`, async () => {
        const row = `0: 0100007F:1234 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode}\n`;
        const f = proc([normal()], {
            read: (path) => (path === `net/${table}` ? Buffer.from(socketHeader + row) : undefined),
        });
        const result = await f.repository.audit(22);
        assert.equal(result.status, 'blocked');
        assert.equal(result.sockets.length, 1);
        assert.equal(result.blocking_sockets.length, 1);
        assert.equal(result.closed_time_wait.length, 0);
        assert.equal(result.listeners.length, state === '0A' ? 1 : 0);
    });

test('invalid IPv4/IPv6 address width does not qualify as closed TCP evidence', async () => {
    const f = proc([normal()], {
        read: (path) =>
            path === 'net/tcp6'
                ? Buffer.from(
                      socketHeader +
                          '0: 0100007F:1234 00000000:0000 06 00000000:00000000 03:00000010 00000000 0 0 0\n',
                  )
                : undefined,
    });
    const result = await f.repository.audit(22);
    assert.equal(result.status, 'blocked');
    assert.equal(NativePilotProcessAuditRepository.quiescent(result), false);
});
