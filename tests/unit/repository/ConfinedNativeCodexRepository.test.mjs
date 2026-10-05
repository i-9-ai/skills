// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { ConfinedNativeCodexRepository } from '../../../src/repository/ConfinedNativeCodexRepository.ts';
import { CodexRpcSession } from '../../../src/transport/CodexRpcSession.ts';
import { NativeCodexConfiguration } from '../../../src/config/NativeCodexConfiguration.ts';

function fixture(closeOnEof = true) {
    const child = new EventEmitter();
    child.pid = 50123;
    let nativeExited = false;
    child.once('exit', () => {
        nativeExited = true;
    });
    const finish = (code, signal) => {
        if (!nativeExited) child.emit('exit', code, signal);
        child.emit('close', code, signal);
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
        write(_data, done) {
            done();
        },
        end() {
            if (closeOnEof) queueMicrotask(() => finish(0, null));
        },
    };
    const signals = [];
    let command;
    class OwnedFake extends ConfinedNativeCodexRepository {
        boundary() {}
    }
    const repository = new OwnedFake({
        execute(executable, argv, options) {
            command = { executable, argv, options };
            return child;
        },
        signal(pid, signal) {
            signals.push({ pid, signal });
            if (signal === 'SIGKILL') queueMicrotask(() => finish(null, signal));
            return true;
        },
    });
    repository.fixtureBaseUrl = 'http://127.0.0.1:1234/v1';
    return {
        repository,
        child,
        signals,
        finish,
        argv: NativeCodexConfiguration.argv(repository.fixtureBaseUrl),
        command: () => command,
    };
}

test('fixed process closes stdio first and retains its observed clean exit without sending signals', async () => {
    const f = fixture();
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    await session.close();
    assert.equal(f.command().executable, '/pilot/runtime-bin/codex');
    assert.deepEqual(f.command().argv, f.argv);
    assert.equal(f.command().options.shell, false);
    assert.deepEqual(f.signals, []);
    assert.deepEqual(
        f.repository.processEvents.map(({ event }) => event),
        ['started', 'termination-requested', 'stdin-eof-requested', 'exit', 'streams-closed'],
    );
    assert.equal(f.repository.processEvents.at(-1).exit_code, 0);
    assert.equal(f.repository.processEvents.at(-1).signal, null);
    assert.equal(f.repository.processEvents.at(-1).timed_out, false);
});

test('unresponsive stdio escalates only within the fixed bound and SIGKILL remains a failure', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const f = fixture(false);
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    const closing = session.close();
    t.mock.timers.tick(38_999);
    assert.deepEqual(f.signals, []);
    t.mock.timers.tick(1);
    assert.deepEqual(f.signals, [{ pid: -50123, signal: 'SIGTERM' }]);
    t.mock.timers.tick(1000);
    await assert.rejects(closing, /unexpected_process_exit/);
    assert.deepEqual(
        f.signals.map(({ signal }) => signal),
        ['SIGTERM', 'SIGKILL'],
    );
    assert.equal(f.repository.processEvents.at(-1).signal, 'SIGKILL');
});

test('a spontaneous exit queued before requested termination is retained and rejected even with exit zero', async () => {
    for (const exit of [0, 17]) {
        const f = fixture(false);
        const stream = await f.repository.start(f.argv);
        const session = new CodexRpcSession(stream, {});
        f.finish(exit, null);
        await assert.rejects(session.close(), /unexpected_process_exit/);
        assert.deepEqual(
            f.repository.processEvents.map(({ event }) => event),
            ['started', 'exit', 'streams-closed', 'termination-requested'],
        );
        assert.equal(f.repository.processEvents[1].exit_code, exit);
    }
});

test('unknown diagnostics keep their first failure through bounded clean termination', async () => {
    const f = fixture();
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    f.child.stderr.emit('data', Buffer.from('unrecognized native diagnostic\n'));
    await assert.rejects(session.close(), /native_diagnostic/);
    assert.equal(f.repository.processEvents.at(-1).exit_code, 0);
});

test('actual exit precedes requested EOF while close drains later: spontaneous zero remains rejected', async () => {
    const f = fixture();
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    f.child.emit('exit', 0, null);
    await assert.rejects(session.close(), /unexpected_process_exit/);
    assert.deepEqual(
        f.repository.processEvents.map(({ event }) => event),
        ['started', 'exit', 'termination-requested', 'stdin-eof-requested', 'streams-closed'],
    );
    assert.deepEqual(f.signals, []);
});

test('close without a native exit witness or with conflicting exit fields cannot pass', async () => {
    for (const inconsistent of [false, true]) {
        const f = fixture(false);
        const stream = await f.repository.start(f.argv);
        const session = new CodexRpcSession(stream, {});
        const closing = session.close();
        if (inconsistent) f.child.emit('exit', 0, null);
        f.child.emit('close', inconsistent ? 7 : 0, null);
        await assert.rejects(closing, /unexpected_process_exit/);
        assert.equal(f.repository.processEvents.at(-1).execution_error, true);
    }
});

test('the existing execution deadline retains timeout facts and cannot become requested clean exit', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const f = fixture(false);
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    t.mock.timers.tick(40_000);
    await assert.rejects(session.close(), /unexpected_process_exit/);
    const exit = f.repository.processEvents.find(({ event }) => event === 'exit');
    assert.equal(exit.signal, 'SIGKILL');
    assert.equal(exit.timed_out, true);
    assert.equal(exit.output_truncated, false);
});

test('EOF may drain for the documented RPC cleanup interval inside the same native deadline', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const f = fixture(false);
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    const closing = session.close();
    t.mock.timers.tick(30_000);
    assert.deepEqual(f.signals, []);
    f.finish(0, null);
    await closing;
    assert.equal(
        f.repository.processEvents.find(({ event }) => event === 'exit').elapsed_ms,
        30_000,
    );
});

test('late EOF uses remaining lifetime and does not reset the forty-second native deadline', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const f = fixture(false);
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    t.mock.timers.tick(35_000);
    const closing = session.close();
    t.mock.timers.tick(3999);
    assert.deepEqual(f.signals, []);
    t.mock.timers.tick(1);
    assert.deepEqual(
        f.signals.map(({ signal }) => signal),
        ['SIGTERM'],
    );
    t.mock.timers.tick(1000);
    await assert.rejects(closing, /unexpected_process_exit/);
    const exit = f.repository.processEvents.find(({ event }) => event === 'exit');
    assert.equal(exit.elapsed_ms, 40_000);
    assert.equal(exit.timed_out, true);
    assert.equal(exit.signal, 'SIGKILL');
});

test('requested SIGTERM exit is retained but cannot satisfy clean native shutdown', async () => {
    const f = fixture(false);
    const stream = await f.repository.start(f.argv);
    const session = new CodexRpcSession(stream, {});
    const closing = session.close();
    f.finish(null, 'SIGTERM');
    await assert.rejects(closing, /unexpected_process_exit/);
});
