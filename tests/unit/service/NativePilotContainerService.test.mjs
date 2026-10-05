import test from 'node:test';
import assert from 'node:assert/strict';
import {
    lstatSync,
    readdirSync,
    readFileSync,
    writeFileSync,
    rmdirSync,
    symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';
import { containerPath } from '../../../src/validator/NativePilotContainerValidator.ts';

for (const host of ['codex', 'claude'])
    test(`synthetic ${host} A→B→A lifecycle retains before exact owned cleanup`, async (t) => {
        const f = containerFixture(t, { host });
        const before = f.inventory.tree(join(f.prepared.root, 'input'));
        let mountInode;
        const facts = [];
        for (const step of f.controller.plan) {
            facts.push(await f.controller.perform(step));
            if (step.id === 'preflight') mountInode = lstatSync(f.controller.files.owned.mount).ino;
            if (step.id === 'select-b' || step.id === 'select-a') {
                assert.equal(lstatSync(f.controller.files.owned.mount).ino, mountInode);
                assert.equal(
                    f.inventory.tree(join(f.controller.files.owned.mount, 'source')).tree_sha256,
                    step.id === 'select-b'
                        ? f.prepared.trees.source_b.tree_sha256
                        : f.prepared.trees.source_a.tree_sha256,
                );
            }
        }
        assert.equal(facts.length, 20);
        assert(facts.every((value) => value.native_acceptance === false));
        assert.equal(facts.at(-1).commands.length, 0);
        assert.equal(f.volumes.size, 0);
        assert.deepEqual(f.inventory.tree(join(f.prepared.root, 'input')), before);
        const retained = f.controller.files.verifyRetention();
        assert.equal(retained.sha256, f.inventory.file(retained.path).sha256);
        const calls = f.calls.map((call) => call.args.slice(4));
        assert(
            calls.findIndex((args) => args.includes('export')) <
                calls.findIndex((args) => args[1] === 'rm'),
        );
        for (const request of f.calls) {
            assert.equal(request.shell, false);
            assert.deepEqual(request.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
            assert.equal(request.executable, f.pin.docker.executable);
            assert.deepEqual(request.args.slice(0, 4), [
                '--host',
                f.pin.docker.endpoint,
                '--config',
                join(f.controller.files.root, 'docker-config'),
            ]);
            assert(
                !request.args.includes('pull') &&
                    !request.args.includes('build') &&
                    !request.args.includes('prune'),
            );
        }
        const create = calls.find((args) => args[1] === 'create' && args[0] === 'container');
        for (const flag of [
            '--pull=never',
            '--read-only',
            '--cap-drop',
            '--pids-limit',
            '--memory',
            '--cpus',
            '--no-healthcheck',
        ])
            assert(create.includes(flag));
        assert(create.includes('none'));
        assert(!create.some((arg) => arg.startsWith('HOME=') || arg.startsWith('CODEX_HOME=')));
        assert.equal(create.filter((arg) => arg.startsWith('type=bind,')).length, 1);
        assert(create.some((arg) => arg.endsWith('dst=/pilot,readonly,bind-propagation=rprivate')));
        assert(
            calls
                .filter(
                    (args) => ['stop', 'kill', 'rm'].includes(args[1]) && args[0] === 'container',
                )
                .every((args) => args.at(-1) === f.id),
        );
    });

const badProbes = {
    'missing kernel resource limit': (v) => {
        v.cgroups.memory_max = 'max';
        return v;
    },
    'forged flags without read-only measurement': (v) => {
        v.denied[0].error = 'EACCES';
        return v;
    },
    'effective root user': (v) => {
        v.uid = 0;
        return v;
    },
    'different passwd home': (v) => {
        v.passwd_home = '/root';
        return v;
    },
    'CODEX_HOME override': (v) => {
        v.environment.push('CODEX_HOME=/pilot/state');
        return v;
    },
    'unexpected credential variable': (v) => {
        v.environment.push('SYNTHETIC_API_KEY=sentinel');
        return v;
    },
    'network timeout without denied route': (v) => {
        v.external_connect = 'timeout';
        return v;
    },
    'extra interface': (v) => {
        v.interfaces.push('eth0');
        return v;
    },
    'nonzero capability': (v) => {
        v.capabilities.effective = '0000000000000001';
        return v;
    },
    'wrong source bytes': (v) => {
        v.hashes.source = '0'.repeat(64);
        return v;
    },
    'privileged socket present': (v) => {
        v.sockets[0].present = true;
        return v;
    },
    'existing credential path': (v) => {
        v.credential_paths.push('.codex/auth.json');
        return v;
    },
    'wrong clean home seed': (v) => {
        v.home_seed_sha256 = '0'.repeat(64);
        return v;
    },
};
for (const [name, probe] of Object.entries(badProbes))
    test(`blocks ${name} before any native command`, async (t) => {
        const f = containerFixture(t, { probe });
        await assert.rejects(f.controller.perform(f.controller.plan[0]));
        assert.equal(f.nativeCalls().length, 0);
        assert.equal(f.volumes.size, 4);
        assert(!f.calls.some((c) => c.args.slice(4, 6).join('/') === 'volume/rm'));
        const file = readdirSync(f.controller.files.root).find((name) =>
            name.endsWith('abort-retention.json'),
        );
        const abort = JSON.parse(readFileSync(join(f.controller.files.root, file), 'utf8'));
        assert.equal(abort.state, 'owned-container-stopped-volumes-retained');
        assert.equal(abort.filesystem_snapshot_verified, false);
    });

for (const [name, mutate] of Object.entries({
    'writable input mount': (i) => {
        i[0].Mounts[0].RW = true;
    },
    'host PID namespace': (i) => {
        i[0].HostConfig.PidMode = 'host';
    },
    'unbounded memory': (i) => {
        i[0].HostConfig.Memory = 0;
    },
    'unreviewed mount': (i) => {
        i[0].Mounts.push({ Type: 'bind', Destination: '/var/run/docker.sock' });
    },
}))
    test(`measured Docker inspection rejects ${name}`, async (t) => {
        const f = containerFixture(t, {
            inspect: (i) => {
                mutate(i);
                return i;
            },
        });
        await assert.rejects(f.controller.perform(f.controller.plan[0]));
        assert.equal(f.nativeCalls().length, 0);
        assert(!f.calls.some((c) => c.args.includes('start')));
    });

test('existing volume is never adopted or deleted', async (t) => {
    const f = containerFixture(t);
    f.volumes.set(f.controller.files.owned.volumes.home, { unrelated: true });
    await assert.rejects(f.controller.perform(f.controller.plan[0]), /already exists/);
    assert.equal(f.nativeCalls().length, 0);
    assert.equal(f.volumes.size, 1);
    assert(!f.calls.some((call) => call.args.includes('create') || call.args.includes('rm')));
});

test('live native process prevents source replacement and is stopped only by owned container ID', async (t) => {
    let extra = false;
    const f = containerFixture(t, {
        audit: (value) => {
            if (extra)
                value.processes.push({ pid: 40, ppid: 1, role: 'unexpected', start_ticks: '4' });
            return value;
        },
    });
    await f.through('stop-a');
    extra = true;
    const source = f.inventory.tree(join(f.controller.files.owned.mount, 'source'));
    await assert.rejects(
        f.controller.perform(f.controller.plan.find((s) => s.id === 'select-b')),
        /absence/,
    );
    assert.deepEqual(f.inventory.tree(join(f.controller.files.owned.mount, 'source')), source);
    assert.equal(f.volumes.size, 4);
    assert(
        f.calls.some(
            (c) => c.args.slice(4, 6).join('/') === 'container/stop' && c.args.at(-1) === f.id,
        ),
    );
});

for (const status of ['timeout', 'execution-error', 'interrupted', 'output-limit', 'unavailable'])
    test(`${status} with exit zero never grants process success`, async (t) => {
        const f = containerFixture(t, {
            command: (value) => {
                value.process.status = status;
                return value;
            },
        });
        await assert.rejects(f.controller.perform(f.controller.plan[0]), /did not complete/);
        assert.equal(f.nativeCalls().length, 1);
        assert.equal(f.volumes.size, 4);
    });

test('corrupt retention blocks deletion and keeps all volumes', async (t) => {
    const f = containerFixture(t, {
        bundle: (value) => {
            value.roots[0].entries[0].sha256 = '0'.repeat(64);
            return value;
        },
    });
    await assert.rejects(f.through('retain'), /content differs/);
    assert.equal(f.volumes.size, 4);
    assert(!f.calls.some((call) => call.args.slice(4, 6).join('/') === 'container/rm'));
});

test('retention changed after capture blocks cleanup and preserves volumes', async (t) => {
    const f = containerFixture(t);
    await f.through('retain');
    writeFileSync(join(f.controller.files.root, 'retained-state.json'), 'changed');
    await assert.rejects(f.controller.perform(f.controller.plan.at(-1)), /evidence changed/);
    assert.equal(f.volumes.size, 4);
    assert(!f.calls.some((call) => call.args.slice(4, 6).join('/') === 'container/rm'));
});

test('prepared inventory metadata mismatch has no Docker or filesystem output effect', async (t) => {
    const f = containerFixture(t);
    f.controller.files.prepared.trees.source_a.entries[0].bytes++;
    const before = readdirSync(join(f.prepared.root, 'output', 'evidence'));
    await assert.rejects(f.controller.perform(f.controller.plan[0]), /inventory metadata/);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(readdirSync(join(f.prepared.root, 'output', 'evidence')), before);
});

test('unknown owned identity stops no unrelated container and deletes no volume', async (t) => {
    const f = containerFixture(t, {
        inspect: (value) => {
            value[0].Config.Labels = { unrelated: 'true' };
            return value;
        },
    });
    await assert.rejects(f.controller.perform(f.controller.plan[0]), /ownership/);
    assert(!f.calls.some((call) => ['stop', 'kill', 'rm'].includes(call.args[5])));
    assert.equal(f.volumes.size, 4);
});

test('phase calls cannot smuggle an arbitrary shell or reorder native work', async (t) => {
    const f = containerFixture(t);
    await assert.rejects(f.controller.perform(f.controller.plan[2]), /phase order/);
    const tampered = structuredClone(f.controller.plan[0]);
    tampered.commands[0].executable = '/bin/sh';
    await assert.rejects(f.controller.perform(tampered), /phase order/);
    assert.equal(f.calls.length, 0);
});

test('Docker timeout cancels required injected transport without a fallback call', async (t) => {
    let request;
    const f = containerFixture(t, {
        intercept: async (value) => {
            if (value.args.slice(4, 6).join('/') === 'image/inspect') {
                request = value;
                return await new Promise(() => {});
            }
        },
    });
    f.controller.files.stage();
    f.controller.docker.boundUntil(Date.now() + 20);
    await assert.rejects(f.controller.docker.image(), /deadline/);
    assert(request.signal.aborted);
    assert.equal(f.nativeCalls().length, 0);
    assert(!f.calls.some((call) => call.args.includes('pull')));
});

test('linked evidence parent is rejected before staging or an abort write', async (t) => {
    const f = containerFixture(t);
    const output = join(f.prepared.root, 'output', 'evidence');
    const input = join(f.prepared.root, 'input', 'source_a');
    const before = f.inventory.tree(input);
    rmdirSync(output);
    symlinkSync(input, output);
    await assert.rejects(f.controller.perform(f.controller.plan[0]), /canonical/);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.inventory.tree(input), before);
});

test('probe-only entrypoint dispatches no native command and retains facts for the later preflight', async (t) => {
    const f = containerFixture(t);
    const probed = await f.controller.inspectBoundary();
    assert.equal(probed.commands.length, 0);
    assert.equal(f.nativeCalls().length, 0);
    assert.equal(probed.native_acceptance, false);
    const preflight = await f.controller.perform(f.controller.plan[0]);
    assert.equal(f.nativeCalls().length, 1);
    assert(
        probed.evidence.every((item) =>
            preflight.evidence.some((other) => other.sha256 === item.sha256),
        ),
    );
    assert.equal(
        f.calls.filter((call) => call.args.slice(4, 6).join('/') === 'container/create').length,
        1,
    );
});

test('a probe-only lane can retain and remove only its disposable resources without native dispatch', async (t) => {
    const f = containerFixture(t);
    await f.controller.inspectBoundary();
    const closed = await f.controller.closeBoundaryInspection();
    assert.equal(closed.native_acceptance, false);
    assert.equal(f.nativeCalls().length, 0);
    assert.equal(f.volumes.size, 0);
    assert(f.controller.files.verifyRetention().sha256);
    await assert.rejects(f.controller.closeBoundaryInspection(), /Only an open/);
});

test('expired operational budget still dispatches owned stop with a separate nonrenewable cleanup capability', async (t) => {
    const f = containerFixture(t);
    await f.controller.inspectBoundary();
    f.controller.docker.boundUntil(Date.now() - 100);
    await f.controller.abort();
    assert(
        f.calls.some(
            (call) =>
                call.args.slice(4, 6).join('/') === 'container/stop' && call.args.at(-1) === f.id,
        ),
    );
    assert.equal(f.volumes.size, 4);
    const before = f.calls.length;
    await assert.rejects(
        f.controller.docker.worker(f.id, { name: 'probe', fresh: false }),
        /Cleanup capability/,
    );
    await assert.rejects(f.controller.docker.start(f.id), /Cleanup capability/);
    assert.equal(f.calls.length, before);
});

test('actual command mapping is retained separately and a swapped mapped command is blocked', async (t) => {
    const f = containerFixture(t);
    const facts = await f.controller.perform(f.controller.plan[0]);
    const artifact = facts.evidence.find((item) => item.path.endsWith('native-process.json'));
    const record = JSON.parse(
        readFileSync(join(f.prepared.root, 'output', 'evidence', artifact.path), 'utf8'),
    );
    assert(record.planned_command.executable.startsWith(f.prepared.root));
    assert.equal(record.actual_command.executable, '/pilot/runtime-bin/node');
    assert.deepEqual(record.actual_command, record.observation.command);
    const bad = containerFixture(t, {
        command: (value) => {
            value.command.executable = '/bin/sh';
            return value;
        },
    });
    await assert.rejects(bad.controller.perform(bad.controller.plan[0]), /Actual worker command/);
    assert.equal(bad.volumes.size, 4);
});

test('native output beyond 128 KiB fits the explicit envelope while combined native limit remains one MiB', async (t) => {
    const f = containerFixture(t, {
        command: (value) => {
            value.stdout = 'x'.repeat(262_144);
            return value;
        },
    });
    const facts = await f.controller.perform(f.controller.plan[0]);
    assert.equal(facts.commands[0].stdout.length, 262_144);
    assert.equal(f.nativeCalls()[0].maxOutputBytes, 8_388_608);
    const bad = containerFixture(t, {
        command: (value) => {
            value.stdout = 'x'.repeat(1_048_577);
            return value;
        },
    });
    await assert.rejects(bad.controller.perform(bad.controller.plan[0]), /identity differs/);
});

test('rejected actual probe bytes remain privately retained before schema interpretation', async (t) => {
    const f = containerFixture(t, {
        probe: (value) => {
            value.cgroups.pids_max = 'unexpected-kernel-value';
            return value;
        },
    });
    await assert.rejects(f.controller.inspectBoundary(), /Kernel resource/);
    const root = f.controller.files.root;
    const requests = readdirSync(root).filter((name) => name.endsWith('.request.json'));
    const rejected = requests
        .map((name) => ({ name, value: JSON.parse(readFileSync(join(root, name), 'utf8')) }))
        .find(({ value }) => value.args.includes('probe'));
    assert(rejected);
    const receipt = JSON.parse(
        readFileSync(join(root, rejected.name.replace('.request.json', '.receipt.json')), 'utf8'),
    );
    assert.equal(receipt.response, 'retained-before-interpretation');
    const captured = JSON.parse(readFileSync(join(root, receipt.streams.stdout.path), 'utf8'));
    assert.equal(captured.cgroups.pids_max, 'unexpected-kernel-value');
    assert.equal(
        f.inventory.file(join(root, receipt.streams.stdout.path)).sha256,
        receipt.streams.stdout.sha256,
    );
    assert.equal(f.nativeCalls().length, 0);
    assert.equal(f.volumes.size, 4);
});
