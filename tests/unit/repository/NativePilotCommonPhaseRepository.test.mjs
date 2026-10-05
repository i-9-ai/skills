import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativePilotCommonPhaseRepository } from '../../../src/repository/NativePilotCommonPhaseRepository.ts';
import { NativePilotCommonPhaseService } from '../../../src/service/NativePilotCommonPhaseService.ts';
import { NativePilotRegistrationObservationValidator } from '../../../src/validator/NativePilotRegistrationObservationValidator.ts';
import { NativePilotConfiguration } from '../../../src/config/NativePilotConfiguration.ts';

const stat = (ticks = '100', parent = process.pid, state = 'S', pid = 90) =>
    Buffer.from(
        `${pid} (synthetic cli) ${state} ${Array.from({ length: 49 }, (_, i) => (i === 0 ? String(parent) : i === 18 ? ticks : '0')).join(' ')}\n`,
    );
function fixture(t, behavior = {}, reader) {
    const output = mkdtempSync(join(tmpdir(), 'i9-common-phase-process-'));
    t.after(() => rmSync(output, { recursive: true, force: true }));
    const events = [];
    const selection = {
        run_id: '41b733f1-7bc6-4e9b-8752-47d18d6c8b49',
        host: 'claude',
        repetition: 1,
        phase: 'baseline',
        pin: null,
        ...behavior.selection,
    };
    const worker = {
        nativeEnvironment: () => {
            behavior.prepareEnvironment?.();
            return { environment: behavior.environment, evidence: null };
        },
        context: () => {
            events.push('context');
            behavior.prepareContext?.();
            return {};
        },
        request: { contract: { observer: { entrypoint: 'src/transport/SyntheticRunner.ts' } } },
    };
    const execute = (executable, argv, options) => {
        events.push({ executable, argv, options });
        if (behavior.throw) throw new Error('synthetic spawn failure');
        const child = new EventEmitter();
        child.pid = behavior.unavailable ? undefined : 90;
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = (signal) => {
            events.push(`kill:${signal}`);
            if (!behavior.noClose) queueMicrotask(() => child.emit('close', null, signal));
            return true;
        };
        queueMicrotask(() => {
            if (behavior.unavailable) {
                child.emit(
                    'error',
                    Object.assign(new Error('synthetic unavailable'), { code: 'ENOENT' }),
                );
                return;
            }
            child.emit('spawn');
            events.push('after-spawn');
            if (behavior.completeAfter !== undefined) {
                setTimeout(() => child.emit('close', 0, null), behavior.completeAfter);
                return;
            }
            if (behavior.wait) return;
            child.stdout.emit('data', behavior.stdout ?? Buffer.from('raw stdout'));
            child.stderr.emit('data', behavior.stderr ?? Buffer.from('raw stderr'));
            events.push('before-close');
            child.emit('close', behavior.exit ?? 1, null);
        });
        return child;
    };
    const child = reader ?? {
        stat: () => {
            events.push('read-stat');
            return stat();
        },
        executable: () => {
            events.push('read-exe');
            return selection.phase.startsWith('observe-')
                ? '/pilot/runtime-bin/node'
                : '/pilot/runtime-bin/claude';
        },
    };
    const repository = new NativePilotCommonPhaseRepository(
        worker,
        execute,
        child,
        behavior.elapsed ?? (() => 0),
    );
    Object.assign(repository, { selection, output, prefix: 'synthetic-phase' });
    const calls = new NativePilotCommonPhaseService().calls(selection, worker.request.contract);
    return { repository, output, calls, events };
}

test('fixed child retains exact nonzero bytes and measures owned PID/start ticks before close without environment override', async (t) => {
    const raw = Buffer.from([0, 255, 65]);
    const f = fixture(t, { stdout: raw });
    const result = await f.repository.run(f.calls[0]);
    assert.deepEqual(result.process, { status: 'completed', exit_code: 1, signal: null });
    assert.equal(result.text, null);
    assert.equal(result.pid, 90);
    assert.equal(result.start_ticks, '100');
    assert.deepEqual(readFileSync(join(f.output, '1-native-auth-status.stdout')), raw);
    const identity = JSON.parse(readFileSync(join(f.output, '1-native-auth-status-identity.json')));
    assert.deepEqual(
        new NativePilotRegistrationObservationValidator().childIdentity(
            identity,
            '/pilot/runtime-bin/claude',
            process.pid,
        ),
        { pid: 90, start_ticks: '100' },
    );
    assert.equal(identity.schema_version, 2);
    assert.equal(identity.observer_pid, process.pid);
    assert.deepEqual(identity.stat_before, identity.stat_after);
    assert(f.events.indexOf('read-stat') < f.events.indexOf('before-close'));
    assert(f.events.indexOf('read-exe') < f.events.indexOf('before-close'));
    const request = f.events.find((value) => value?.options);
    assert.deepEqual(request.argv, ['auth', 'status']);
    assert.equal(request.options.shell, false);
    assert.equal(Object.hasOwn(request.options, 'env'), false);
    assert.equal(request.options.cwd, '/pilot/consumer');
});

test('combined raw output bound kills only its child and never classifies the retained prefix as successful', async (t) => {
    const f = fixture(t, {
        stdout: Buffer.alloc(1048576, 65),
        stderr: Buffer.from('overflow'),
        exit: 0,
    });
    const result = await f.repository.run(f.calls[0]);
    assert.equal(result.process.status, 'output-limit');
    assert.equal(result.text, null);
    assert.equal(result.stdout.bytes, 1048576);
    assert.equal(result.stderr.bytes, 0);
    assert(f.events.includes('kill:SIGKILL'));
});

test('reordered or caller-selected commands have no child or retained-file effect', async (t) => {
    const f = fixture(t);
    for (const call of [
        f.calls[1],
        { ...f.calls[0], argv: ['-p', 'inert'] },
        { ...f.calls[0], executable: '/bin/sh' },
    ])
        await assert.rejects(f.repository.run(call), /order differs/);
    assert(!f.events.some((value) => value?.options));
    assert.deepEqual(readdirSync(f.output), []);
});

test('unreadable, changed or mismatched child identities retain bytes and never synthesize a start time', async (t) => {
    for (const reader of [
        {
            stat: () => {
                throw Error('synthetic disappeared');
            },
            executable: () => '/pilot/runtime-bin/claude',
        },
        { stat: () => Buffer.from('unrecognized'), executable: () => '/pilot/runtime-bin/claude' },
        { stat: () => stat(), executable: () => '/unselected/executable' },
        (() => {
            let n = 0;
            return { stat: () => stat(String(++n)), executable: () => '/pilot/runtime-bin/claude' };
        })(),
    ]) {
        const f = fixture(t, {}, reader);
        const result = await f.repository.run(f.calls[0]);
        assert.equal(result.start_ticks, null);
        assert.equal(result.process.status, 'completed');
        const identity = JSON.parse(
            readFileSync(join(f.output, '1-native-auth-status-identity.json')),
        );
        assert.equal(
            new NativePilotRegistrationObservationValidator().childIdentity(
                identity,
                '/pilot/runtime-bin/claude',
                process.pid,
            ),
            null,
        );
        assert.equal(
            readFileSync(join(f.output, '1-native-auth-status.stdout'), 'utf8'),
            'raw stdout',
        );
    }
});

for (const [name, first, second] of [
    ['foreign parent', stat('100', 1), stat('100', 1)],
    ['parent changed on second sample', stat(), stat('100', 1)],
    ['start ticks changed', stat(), stat('101')],
    ['second PID changed', stat(), stat('100', process.pid, 'S', 91)],
    ['second became zombie', stat(), stat('100', process.pid, 'Z')],
    ['invalid second sample', stat(), Buffer.from('unknown')],
]) {
    test(`${name} retains both raw samples but cannot establish outer ownership`, async (t) => {
        let reads = 0;
        const f = fixture(
            t,
            {},
            {
                stat: () => (reads++ === 0 ? first : second),
                executable: () => '/pilot/runtime-bin/claude',
            },
        );
        const result = await f.repository.run(f.calls[0]);
        assert.equal(result.start_ticks, null);
        const identity = JSON.parse(
            readFileSync(join(f.output, '1-native-auth-status-identity.json')),
        );
        assert.equal(identity.status, 'invalid');
        assert.deepEqual(Buffer.from(identity.stat_before.base64, 'base64'), first);
        assert.deepEqual(Buffer.from(identity.stat_after.base64, 'base64'), second);
        assert.equal(
            new NativePilotRegistrationObservationValidator().childIdentity(
                identity,
                '/pilot/runtime-bin/claude',
                process.pid,
            ),
            null,
        );
    });
}

test('valid changing live state retains complete second sample and requires external parent authority', async (t) => {
    let reads = 0;
    const f = fixture(
        t,
        {},
        {
            stat: () => (reads++ === 0 ? stat() : stat('100', process.pid, 'R')),
            executable: () => '/pilot/runtime-bin/claude',
        },
    );
    await f.repository.run(f.calls[0]);
    const identity = JSON.parse(readFileSync(join(f.output, '1-native-auth-status-identity.json')));
    const codec = new NativePilotRegistrationObservationValidator();
    assert.equal(identity.status, 'observed');
    assert.notEqual(identity.stat_before.sha256, identity.stat_after.sha256);
    assert.deepEqual(codec.childIdentity(identity, '/pilot/runtime-bin/claude', process.pid), {
        pid: 90,
        start_ticks: '100',
    });
    assert.equal(codec.childIdentity(identity, '/pilot/runtime-bin/claude'), null);
    assert.equal(codec.childIdentity(identity, '/pilot/runtime-bin/claude', process.pid + 1), null);
});

test('trusted common self receipt uses actual runtime PID/PPID and awaits independent worker correlation', (t) => {
    const reads = [];
    const f = fixture(
        t,
        {},
        {
            stat: (pid) => {
                reads.push(pid);
                return stat('123', process.ppid, 'S', pid);
            },
            executable: () => '/pilot/runtime-bin/node',
        },
    );
    const context = f.repository.commonProcess();
    assert.equal(context.pid, process.pid);
    assert.equal(context.worker_pid, process.ppid);
    assert.deepEqual(reads, [process.pid, process.pid]);
    const identity = JSON.parse(readFileSync(join(f.output, 'common-process-identity.json')));
    const codec = new NativePilotRegistrationObservationValidator();
    assert.deepEqual(codec.childIdentity(identity, '/pilot/runtime-bin/node', process.ppid), {
        pid: process.pid,
        start_ticks: '123',
    });
    assert.equal(codec.childIdentity(identity, '/pilot/runtime-bin/node'), null);
    assert.equal(context.identity.path, 'synthetic-phase/common-process-identity.json');
});

test('a self sample from a foreign worker is retained before context is rejected', (t) => {
    const f = fixture(
        t,
        {},
        {
            stat: (pid) => stat('123', 1, 'S', pid),
            executable: () => '/pilot/runtime-bin/node',
        },
    );
    assert.throws(() => f.repository.commonProcess(), /identity is unavailable/);
    const identity = JSON.parse(readFileSync(join(f.output, 'common-process-identity.json')));
    assert.equal(identity.status, 'invalid');
    assert.equal(identity.observer_pid, process.ppid);
    assert(identity.stat_before && identity.stat_after);
});

test('a vanished or oversized second stat remains unobserved and preserves the first bounded sample', async (t) => {
    for (const second of [
        () => {
            throw new Error('synthetic exit');
        },
        () => Buffer.alloc(4097),
    ]) {
        let reads = 0;
        const f = fixture(
            t,
            {},
            {
                stat: () => (reads++ === 0 ? stat() : second()),
                executable: () => '/pilot/runtime-bin/claude',
            },
        );
        const result = await f.repository.run(f.calls[0]);
        const identity = JSON.parse(
            readFileSync(join(f.output, '1-native-auth-status-identity.json')),
        );
        assert.equal(result.start_ticks, null);
        assert.equal(identity.status, 'unavailable');
        assert(identity.stat_before);
        assert.equal(identity.stat_after, null);
    }
});

test('selected observer completes after 40 seconds within the absolute 60-second outer phase budget', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const f = fixture(t, {
        selection: { phase: 'observe-a', pin: 'a' },
        completeAfter: 40200,
        elapsed: () => Date.now(),
    });
    const pending = f.repository.run(f.calls[0]);
    await Promise.resolve();
    t.mock.timers.tick(40200);
    const result = await pending;
    assert.equal(result.process.status, 'completed');
    assert(!f.events.includes('kill:SIGKILL'));
    const budget = JSON.parse(
        readFileSync(join(f.output, '1-selected-native-observer-budget.json')),
    );
    assert.equal(budget.timeout_ms, 58000);
    assert.equal(budget.phase_limit_ms, 60000);
    assert.equal(budget.dispatched, true);
});

for (const stage of ['prepareContext', 'prepareEnvironment']) {
    test(`insufficient time after ${stage} blocks selected dispatch and retains exact reason`, async (t) => {
        let elapsed = 0;
        const f = fixture(t, {
            selection: { phase: 'observe-a', pin: 'a' },
            elapsed: () => elapsed,
            [stage]: () => {
                elapsed = 16001;
            },
        });
        const result = await f.repository.run(f.calls[0]);
        assert.equal(result.process.status, 'timeout');
        assert.equal(result.pid, null);
        assert(!f.events.some((value) => value?.options));
        const budget = JSON.parse(
            readFileSync(join(f.output, '1-selected-native-observer-budget.json')),
        );
        assert.equal(budget.dispatched, false);
        assert.equal(budget.reason, 'insufficient-remaining-phase-budget');
        assert.equal(budget.elapsed_ms, 16001);
    });
}

test('both selected labels share nested reserves and the limit is never renewed', () => {
    for (const label of ['selected-native-observer', 'selected-native-absence-observer']) {
        const beginning = NativePilotConfiguration.observationBudget(label, 0);
        const lastStart = NativePilotConfiguration.observationBudget(label, 16000);
        assert.equal(beginning.timeout_ms, 58000);
        assert.equal(lastStart.timeout_ms, 42000);
        assert.equal(lastStart.minimum_child_ms, 42000);
        for (const elapsed of [16000.001, 16001, 45000, 60000, NaN, Infinity, -1])
            assert.equal(NativePilotConfiguration.observationBudget(label, elapsed).timeout_ms, 0);
    }
    assert.equal(NativePilotConfiguration.limits.observe_ms, 60000);
});

const measuredPreparation = [
    { label: 'observe repetition 1', elapsed: 2131.732744, expected: 55868 },
    { label: 'observe repetition 2', elapsed: 2061.915712, expected: 55938 },
    { label: 'baseline repetition 1', elapsed: 5657.71578, expected: 52342 },
    { label: 'baseline repetition 2', elapsed: 4072.111421, expected: 53927 },
];

for (const phase of ['observe-a', 'baseline']) {
    for (const measured of measuredPreparation) {
        test(`${phase} dispatches with the retained ${measured.label} preparation time without changing native lifetime`, async (t) => {
            let f;
            f = fixture(
                t,
                {
                    selection: { host: 'codex', phase, pin: phase === 'baseline' ? null : 'a' },
                    exit: 0,
                    elapsed: () => measured.elapsed,
                },
                {
                    stat: () => stat(),
                    executable: () => f.events.findLast((value) => value?.options).executable,
                },
            );
            let result;
            for (const call of f.calls) result = await f.repository.run(call);
            const label = f.calls.at(-1).label;
            const budget = JSON.parse(
                readFileSync(join(f.output, `${f.calls.length}-${label}-budget.json`)),
            );
            assert.equal(budget.selected, true);
            assert.equal(budget.dispatched, true);
            assert.equal(budget.elapsed_ms, measured.elapsed);
            assert.equal(budget.timeout_ms, measured.expected);
            assert.equal(budget.minimum_child_ms, 42000);
            assert.equal(budget.reason, null);
            assert.deepEqual(result.process, { status: 'completed', exit_code: 0, signal: null });
            assert.equal(result.pid, 90);
            assert.equal(result.start_ticks, '100');
            assert(
                measured.elapsed +
                    budget.timeout_ms +
                    budget.child_rescue_ms +
                    budget.phase_finish_ms <=
                    60000,
            );
        });
    }

    for (const [elapsed, dispatched] of [
        [15999.999, true],
        [16000, true],
        [16000.001, false],
    ]) {
        test(`${phase} has an exact nonrenewable remaining-budget boundary at elapsed ${elapsed}`, async (t) => {
            let f;
            f = fixture(
                t,
                {
                    selection: { host: 'codex', phase, pin: phase === 'baseline' ? null : 'a' },
                    exit: 0,
                    elapsed: () => elapsed,
                },
                {
                    stat: () => stat(),
                    executable: () => f.events.findLast((value) => value?.options).executable,
                },
            );
            let result;
            for (const call of f.calls) result = await f.repository.run(call);
            const label = f.calls.at(-1).label;
            const budget = JSON.parse(
                readFileSync(join(f.output, `${f.calls.length}-${label}-budget.json`)),
            );
            assert.equal(budget.dispatched, dispatched);
            assert.equal(budget.timeout_ms, dispatched ? 42000 : 0);
            assert.equal(budget.phase_limit_ms, 60000);
            assert.equal(
                f.events.filter((value) => value?.options).length,
                f.calls.length - (dispatched ? 0 : 1),
            );
            assert.equal(result.process.status, dispatched ? 'completed' : 'timeout');
            assert.equal(result.pid, dispatched ? 90 : null);
            if (!dispatched) {
                assert.equal(budget.reason, 'insufficient-remaining-phase-budget');
                assert.equal(result.stdout.bytes, 0);
                assert.equal(result.stderr.bytes, 0);
            } else {
                assert(
                    elapsed + budget.timeout_ms + budget.child_rescue_ms + budget.phase_finish_ms <=
                        60000,
                );
            }
        });
    }
}

test('the outer change preserves the native lifetime, child reserves and unrelated resource limits', () => {
    assert.deepEqual(NativePilotConfiguration.observation, {
        ordinary_child_ms: 12000,
        native_lifetime_ms: 40000,
        selected_setup_ms: 1000,
        selected_drain_ms: 500,
        selected_report_ms: 500,
        child_rescue_ms: 1000,
        phase_finish_ms: 1000,
    });
    assert.deepEqual(NativePilotConfiguration.limits, {
        job_ms: 1800000,
        command_ms: 90000,
        observe_ms: 60000,
        cleanup_ms: 30000,
        output_bytes: 1048576,
        tree_files: 10000,
        tree_bytes: 536870912,
        file_bytes: 33554432,
        loaded_inventory_bytes: 33554432,
        binary_bytes: 536870912,
    });
});

test('a late ordinary call reserves bounded rescue/finalization and cannot use a new 12-second window', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 57000 });
    const f = fixture(t, { wait: true, noClose: true, elapsed: () => Date.now() });
    const pending = f.repository.run(f.calls[0]);
    await Promise.resolve();
    t.mock.timers.tick(1000);
    assert(f.events.includes('kill:SIGKILL'));
    t.mock.timers.tick(1000);
    const result = await pending;
    assert.equal(result.process.status, 'timeout');
    assert.equal(Date.now(), 59000);
});

test('selected timeout and unknown exit use bounded rescue before the fixed 60-second phase deadline', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const f = fixture(t, {
        selection: { phase: 'observe-a', pin: 'a' },
        wait: true,
        noClose: true,
        elapsed: () => Date.now(),
    });
    const pending = f.repository.run(f.calls[0]);
    await Promise.resolve();
    t.mock.timers.tick(58000);
    assert(f.events.includes('kill:SIGKILL'));
    t.mock.timers.tick(1000);
    const result = await pending;
    assert.equal(result.process.status, 'timeout');
    assert.equal(Date.now(), 59000);
    assert.equal(NativePilotConfiguration.limits.observe_ms, 60000);
});

test('spawn absence and synchronous failure retain closed blocked process classifications', async (t) => {
    for (const [behavior, status] of [
        [{ unavailable: true }, 'unavailable'],
        [{ throw: true }, 'execution-error'],
    ]) {
        const f = fixture(t, behavior);
        const result = await f.repository.run(f.calls[0]);
        assert.equal(result.process.status, status);
        assert.equal(result.pid, null);
        assert.equal(result.start_ticks, null);
        assert.equal(result.stdout.bytes, 0);
    }
});

test('deadline terminates only owned child and bounded rescue preserves unknown exit honestly', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(t, { wait: true, noClose: true });
    const pending = f.repository.run(f.calls[0]);
    await Promise.resolve();
    t.mock.timers.tick(12000);
    assert(f.events.includes('kill:SIGKILL'));
    t.mock.timers.tick(1000);
    const result = await pending;
    assert.deepEqual(result.process, { status: 'timeout', exit_code: null, signal: null });
    assert.equal(result.start_ticks, '100');
});

test('common native and observer children inherit only the worker selected offline additions and unchanged normal home', async (t) => {
    const environment = {
        HOME: join('/', 'home', 'node'),
        PATH: '/pilot/runtime-bin:/usr/local/bin:/usr/bin:/bin',
        NPM_CONFIG_OFFLINE: 'true',
    };
    const original = structuredClone(environment);
    const f = fixture(t, { environment });
    await f.repository.run(f.calls[0]);
    const request = f.events.find((value) => value?.options);
    assert.deepEqual(request.options.env, original);
    assert.deepEqual(environment, original);
    assert.equal(Object.hasOwn(request.options.env, 'CODEX_HOME'), false);
});
