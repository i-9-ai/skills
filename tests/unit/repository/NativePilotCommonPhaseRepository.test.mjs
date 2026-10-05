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

const stat = (ticks = '100') =>
    Buffer.from(
        `90 (synthetic cli) S ${Array.from({ length: 49 }, (_, i) => (i === 18 ? ticks : '0')).join(' ')}\n`,
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
    };
    const worker = {
        nativeEnvironment: () => ({ environment: behavior.environment, evidence: null }),
        context: () => {
            events.push('context');
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
            return '/pilot/runtime-bin/claude';
        },
    };
    const repository = new NativePilotCommonPhaseRepository(worker, execute, child);
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
        ),
        { pid: 90, start_ticks: '100' },
    );
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
            ),
            null,
        );
        assert.equal(
            readFileSync(join(f.output, '1-native-auth-status.stdout'), 'utf8'),
            'raw stdout',
        );
    }
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
