// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import {
    SkillMcpTransport,
    MAX_MCP_REQUEST_BYTES,
    MAX_MCP_RESPONSE_BYTES,
    MAX_MCP_ID_BYTES,
} from '../../../src/transport/SkillMcpTransport.ts';

function transport() {
    const input = new PassThrough();
    const output = new PassThrough();
    const calls = [];
    let text = '';
    output.on('data', (chunk) => {
        text += chunk;
    });
    const store = {
        record(value) {
            calls.push(['record', value]);
            return { recorded: true };
        },
        rank() {
            calls.push(['rank']);
            return { rows: [] };
        },
        close() {
            calls.push(['close']);
        },
    };
    const done = new SkillMcpTransport({ name: 'i9-skills', version: '4.5.6-test' }).startServer(
        store,
        input,
        output,
    );
    return {
        input,
        done,
        calls,
        responses: () => text.trim().split('\n').filter(Boolean).map(JSON.parse),
    };
}

test('initialize advertises supplied implementation identity independently of protocol version', async () => {
    const running = transport();
    running.input.end('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
    await running.done;

    assert.deepEqual(running.responses()[0].result, {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'i9-skills', version: '4.5.6-test' },
    });
    assert.deepEqual(running.calls, [['close']]);
});

test('protocol state prevents storage calls before initialization and closes once', async () => {
    const running = transport();
    running.input.end(
        JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'skill_read_record' },
        }) + '\n',
    );
    await running.done;

    assert.deepEqual(running.calls, [['close']]);
    assert.equal(running.responses()[0].error.code, -32602);
});

test('oversized protocol input never reaches storage or echoes the supplied content', async () => {
    const running = transport();
    running.input.end('x'.repeat(1_048_577));
    await running.done;

    assert.deepEqual(running.calls, [['close']]);
    assert.deepEqual(running.responses(), []);
});

test('invalid JSON and notification-shaped payloads cannot record read evidence', async () => {
    const running = transport();
    running.input.end(
        'not-json\n' + JSON.stringify({ jsonrpc: '2.0', method: 'tools/call' }) + '\n',
    );
    await running.done;

    assert.deepEqual(running.calls, [['close']]);
    assert.equal(running.responses().length, 1);
    assert.equal(running.responses()[0].error.code, -32700);
});

test('request IDs cannot overflow error responses or dispatch storage operations', async () => {
    const running = transport();
    const envelope = { jsonrpc: '2.0', id: '', method: 'tools/list' };
    const maximumIngressId = 'x'.repeat(
        MAX_MCP_REQUEST_BYTES - Buffer.byteLength(JSON.stringify(envelope)),
    );
    const accepted = ['x'.repeat(MAX_MCP_ID_BYTES - 2), '\u0000'.repeat(170) + 'ab'];
    const rejected = ['x'.repeat(MAX_MCP_ID_BYTES - 1), '\u0000'.repeat(171), 'é'.repeat(512)];
    const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        ...rejected.map((id) => ({
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: { name: 'skill_read_record' },
        })),
        { ...envelope, id: maximumIngressId },
        ...accepted.map((id) => ({ jsonrpc: '2.0', id, method: 'ping' })),
        { jsonrpc: '2.0', id: 2, method: 'ping' },
    ];
    // The tools/list request itself is exactly at the ingress boundary.
    running.input.end(requests.map((request) => JSON.stringify(request)).join('\n') + '\n');
    await running.done;

    const responses = running.responses();
    assert.deepEqual(running.calls, [['close']]);
    assert.equal(responses.length, 8);
    for (const response of responses.slice(1, 5)) {
        assert.equal(response.id, null);
        assert.equal(response.error.code, -32600);
    }
    assert.deepEqual(
        responses.slice(5).map((response) => response.id),
        [...accepted, 2],
    );
    for (const response of responses)
        assert.ok(Buffer.byteLength(JSON.stringify(response) + '\n') <= MAX_MCP_RESPONSE_BYTES);
});

test('oversized tool output becomes a bounded error without losing the following request', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = '';
    let closed = 0;
    const maximumEscapedId = '\u0000'.repeat(170) + 'ab';
    output.on('data', (chunk) => {
        text += chunk;
    });
    const done = new SkillMcpTransport({ name: 'i9-skills', version: '4.5.6-test' }).startServer(
        {
            record() {
                assert.fail('unexpected recording');
            },
            rank() {
                return { rows: ['private-result-sentinel'.repeat(65536)] };
            },
            close() {
                closed += 1;
            },
        },
        input,
        output,
    );
    input.end(
        [
            { jsonrpc: '2.0', id: 1, method: 'initialize' },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            {
                jsonrpc: '2.0',
                id: maximumEscapedId,
                method: 'tools/call',
                params: { name: 'skill_read_rankings' },
            },
            { jsonrpc: '2.0', id: 3, method: 'ping' },
        ]
            .map((request) => JSON.stringify(request))
            .join('\n') + '\n',
    );
    await done;
    const responses = text.trim().split('\n').map(JSON.parse);
    assert.deepEqual(
        responses.map((response) => response.id),
        [1, maximumEscapedId, 3],
    );
    assert.equal(responses[1].result.isError, true);
    assert.equal(responses[1].result.structuredContent.error.code, 'response_too_large');
    assert.deepEqual(responses[2].result, {});
    assert.equal(text.includes('private-result-sentinel'), false);
    assert.ok(Buffer.byteLength(text) < 4096);
    assert.equal(closed, 1);
});
test('duplicate JSON fields and deeply nested or invalid UTF-8 requests never reach storage', async () => {
    const running = transport();
    const requests = [
        '{"jsonrpc":"2.0","id":1,"method":"initialize"}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"ping","method":"tools/call"}',
        '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"skill_read_record","arguments":{"event_id":"first","event_id":"second"}}}',
        '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"skill_read_record","arguments":' +
            '['.repeat(65) +
            '0' +
            ']'.repeat(65) +
            '}}',
    ];
    running.input.end(
        Buffer.concat([
            Buffer.from(requests.join('\n') + '\n'),
            Buffer.from('{"jsonrpc":"2.0","id":5,"method":"'),
            Buffer.from([0xff]),
            Buffer.from('"}\n'),
        ]),
    );
    await running.done;

    assert.deepEqual(running.calls, [['close']]);
    assert.deepEqual(
        running
            .responses()
            .slice(1)
            .map((response) => response.error.code),
        [-32700, -32700, -32700, -32700],
    );
});

test('a stalled output peer pauses requests and resumes in order when it drains', async () => {
    const input = new PassThrough();
    const output = new PassThrough({ highWaterMark: 128 });
    let rankings = 0;
    let closed = 0;
    const ready = once(output, 'readable');
    const done = new SkillMcpTransport({ name: 'i9-skills', version: '4.5.6-test' }).startServer(
        {
            record() {
                assert.fail('unexpected record');
            },
            rank() {
                rankings += 1;
                return { rows: ['x'.repeat(2048)] };
            },
            close() {
                closed += 1;
            },
        },
        input,
        output,
    );
    input.end(
        [
            { jsonrpc: '2.0', id: 1, method: 'initialize' },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            ...Array.from({ length: 256 }, (_, index) => ({
                jsonrpc: '2.0',
                id: index + 2,
                method: 'tools/call',
                params: { name: 'skill_read_rankings' },
            })),
        ]
            .map((request) => JSON.stringify(request) + '\n')
            .join(''),
    );
    await ready;

    assert.equal(rankings, 0, 'no request may run while the initialize response is stalled');
    assert.ok(output.writableLength < 1024, 'only the pending response may be buffered');
    let text = '';
    output.on('data', (chunk) => {
        text += chunk;
    });
    output.resume();
    await done;
    assert.equal(rankings, 256);
    assert.equal(closed, 1);
    assert.deepEqual(
        text
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line).id),
        Array.from({ length: 257 }, (_, index) => index + 1),
    );
    output.destroy();
});

test('closing a stalled output rejects the server and closes storage exactly once', async () => {
    const input = new PassThrough();
    const output = new PassThrough({ highWaterMark: 1 });
    let closed = 0;
    const ready = once(output, 'readable');
    const done = new SkillMcpTransport({ name: 'i9-skills', version: '4.5.6-test' }).startServer(
        {
            record() {
                assert.fail('unexpected record');
            },
            rank() {
                assert.fail('unexpected ranking');
            },
            close() {
                closed += 1;
            },
        },
        input,
        output,
    );
    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
    await ready;
    output.destroy();
    await assert.rejects(done, /MCP output closed/);
    assert.equal(closed, 1);
    assert.equal(input.destroyed, true);
});

for (const failure of ['error', 'premature close']) {
    test(
        `input ${failure} cancels a stalled response and discards buffered requests`,
        { timeout: 2000 },
        async (t) => {
            const input = new PassThrough();
            const output = new PassThrough({ highWaterMark: 1 });
            const calls = [];
            const ready = once(output, 'readable');
            t.after(() => output.destroy());
            const done = new SkillMcpTransport({
                name: 'i9-skills',
                version: '4.5.6-test',
            }).startServer(
                {
                    record() {
                        calls.push('record');
                    },
                    rank() {
                        calls.push('rank');
                    },
                    close() {
                        calls.push('close');
                    },
                },
                input,
                output,
            );
            input.write(
                [
                    { jsonrpc: '2.0', id: 1, method: 'initialize' },
                    { jsonrpc: '2.0', method: 'notifications/initialized' },
                    {
                        jsonrpc: '2.0',
                        id: 2,
                        method: 'tools/call',
                        params: { name: 'skill_read_record' },
                    },
                ]
                    .map((request) => JSON.stringify(request) + '\n')
                    .join(''),
            );
            await ready;
            input.destroy(failure === 'error' ? new Error('Synthetic input failure') : undefined);

            await assert.rejects(done, /Synthetic input failure|MCP input closed/);
            assert.deepEqual(calls, ['close']);
            output.resume();
            await nextTurn();
            assert.deepEqual(
                calls,
                ['close'],
                'draining after cancellation must not dispatch queued requests',
            );
            assert.equal(output.listenerCount('error'), 0);
            assert.equal(output.listenerCount('close'), 0);
        },
    );
}

for (const failure of ['error', 'premature close']) {
    test(
        `input ${failure} destroys a write that never completes and removes its listeners`,
        { timeout: 2000 },
        async (t) => {
            const input = new PassThrough();
            const started = Promise.withResolvers();
            const output = new Writable({
                write() {
                    started.resolve();
                },
            });
            t.after(() => output.destroy());
            let closed = 0;
            const done = new SkillMcpTransport({
                name: 'i9-skills',
                version: '4.5.6-test',
            }).startServer(
                {
                    record() {
                        assert.fail('unexpected record');
                    },
                    rank() {
                        assert.fail('unexpected ranking');
                    },
                    close() {
                        closed += 1;
                    },
                },
                input,
                output,
            );
            input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
            await started.promise;
            input.destroy(failure === 'error' ? new Error('Synthetic input failure') : undefined);
            await assert.rejects(done, /Synthetic input failure|MCP input closed/);
            await nextTurn();
            assert.equal(
                output.destroyed,
                true,
                'cancellation must terminate the pending writable',
            );
            assert.equal(output.closed, true);
            assert.equal(output.listenerCount('error'), 0);
            assert.equal(output.listenerCount('close'), 0);
            assert.equal(closed, 1);
        },
    );
}

for (const timing of ['synchronous', 'microtask', 'immediate']) {
    test(
        `a ${timing} write callback failure rejects without an unhandled error`,
        { timeout: 2000 },
        async () => {
            const input = new PassThrough();
            let closed = 0;
            const output = new Writable({
                write(chunk, encoding, callback) {
                    const fail = () => callback(new Error('Synthetic output failure'));
                    if (timing === 'microtask') return queueMicrotask(fail);
                    if (timing === 'immediate') return setImmediate(fail);
                    fail();
                },
            });
            const done = new SkillMcpTransport({
                name: 'i9-skills',
                version: '4.5.6-test',
            }).startServer(
                {
                    record() {
                        assert.fail('unexpected record');
                    },
                    rank() {
                        assert.fail('unexpected ranking');
                    },
                    close() {
                        closed += 1;
                    },
                },
                input,
                output,
            );
            input.end('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
            await assert.rejects(done, /Synthetic output failure/);
            await nextTurn();
            assert.equal(closed, 1);
            assert.equal(input.destroyed, true);
            assert.equal(output.listenerCount('error'), 0);
        },
    );
}

test(
    'an in-flight write still handles a late error after input cancellation',
    { timeout: 2000 },
    async () => {
        const input = new PassThrough();
        let failWrite;
        let closed = 0;
        const started = Promise.withResolvers();
        const output = new Writable({
            write(chunk, encoding, callback) {
                failWrite = callback;
                started.resolve();
            },
        });
        const done = new SkillMcpTransport({
            name: 'i9-skills',
            version: '4.5.6-test',
        }).startServer(
            {
                record() {
                    assert.fail('unexpected record');
                },
                rank() {
                    assert.fail('unexpected ranking');
                },
                close() {
                    closed += 1;
                },
            },
            input,
            output,
        );
        input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
        await started.promise;
        input.destroy(new Error('Synthetic input failure'));
        await assert.rejects(done, /Synthetic input failure/);
        await nextTurn();
        assert.equal(output.closed, true, 'the late callback runs after writable teardown');
        assert.equal(output.listenerCount('error'), 0);
        queueMicrotask(() => failWrite(new Error('Late output failure')));
        await nextTurn();
        assert.equal(closed, 1);
        assert.equal(output.listenerCount('error'), 0);
    },
);

test(
    'cancellation handles a writable destruction error without keeping listeners',
    { timeout: 2000 },
    async () => {
        const input = new PassThrough();
        const started = Promise.withResolvers();
        const output = new Writable({
            write() {
                started.resolve();
            },
            destroy(error, callback) {
                queueMicrotask(() => callback(new Error('Synthetic shutdown failure')));
            },
        });
        let closed = 0;
        const done = new SkillMcpTransport({
            name: 'i9-skills',
            version: '4.5.6-test',
        }).startServer(
            {
                record() {
                    assert.fail('unexpected record');
                },
                rank() {
                    assert.fail('unexpected ranking');
                },
                close() {
                    closed += 1;
                },
            },
            input,
            output,
        );
        input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
        await started.promise;
        input.destroy(new Error('Synthetic input failure'));
        await assert.rejects(done, /Synthetic input failure/);
        await nextTurn();
        assert.equal(output.closed, true);
        assert.equal(output.listenerCount('error'), 0);
        assert.equal(output.listenerCount('close'), 0);
        assert.equal(closed, 1);
    },
);

test(
    'a cancelled writable cannot accumulate listeners through another server invocation',
    { timeout: 2000 },
    async () => {
        const output = new Writable({ write() {} });
        output.destroy();
        await nextTurn();
        let closed = 0;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const input = Readable.from(['{"jsonrpc":"2.0","id":1,"method":"ping"}\n']);
            await assert.rejects(
                new SkillMcpTransport({ name: 'i9-skills', version: '4.5.6-test' }).startServer(
                    {
                        record() {
                            assert.fail('unexpected record');
                        },
                        rank() {
                            assert.fail('unexpected ranking');
                        },
                        close() {
                            closed += 1;
                        },
                    },
                    input,
                    output,
                ),
                /MCP output closed/,
            );
            assert.equal(output.listenerCount('error'), 0);
            assert.equal(output.listenerCount('close'), 0);
        }
        assert.equal(closed, 3);
    },
);

async function stdioFixture(t, { cancel, initializeStdout, windowsFallback = false }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-stdout-test-'));
    const source = new URL('../../../src/transport/SkillMcpTransport.ts', import.meta.url);
    const child = spawn(
        process.execPath,
        [
            '--input-type=module',
            '--eval',
            `
                import assert from 'node:assert/strict';
                import { setImmediate as nextTurn } from 'node:timers/promises';
                import { SkillMcpTransport } from ${JSON.stringify(source.href)};
                ${windowsFallback ? "Object.defineProperty(process, 'platform', { value: 'win32' });" : ''}
                let stdoutWrites = 0;
                ${
                    initializeStdout || windowsFallback
                        ? `const stdout = process.stdout;
                           const write = stdout.write;
                           stdout.write = function (...args) {
                               stdoutWrites += 1;
                               return write.apply(this, args);
                           };`
                        : ''
                }
                let closed = 0;
                let rankings = 0;
                const store = {
                    record() { assert.fail('unexpected record'); },
                    rank() {
                        rankings += 1;
                        ${cancel ? "setImmediate(() => process.stdin.destroy(new Error('Synthetic input failure')));" : ''}
                        return { rows: ['x'.repeat(256 * 1024)] };
                    },
                    close() { closed += 1; }
                };
                const done = new SkillMcpTransport({ name: 'i9-skills', version: '4.5.6-test' }).startServer(store);
                ${cancel ? 'await assert.rejects(done, /Synthetic input failure/);' : 'await done;'}
                await nextTurn();
                assert.equal(closed, 1);
                assert.equal(rankings, 1);
                process.stderr.write(JSON.stringify({ closed, rankings, stdoutWrites }) + '\\n');
            `,
        ],
        {
            cwd: root,
            env: { HOME: root, USERPROFILE: root, NODE_DISABLE_COMPILE_CACHE: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
            killSignal: 'SIGKILL',
        },
    );
    const exited = once(child, 'exit');
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
            await exited;
        }
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        fs.rmSync(root, { recursive: true, force: true });
    });
    let stderr = '';
    let stdout = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
        stderr += chunk;
    });
    const stderrEnded = once(child.stderr, 'end');
    if (!cancel) {
        child.stdout.setEncoding('utf8').on('data', (chunk) => {
            stdout += chunk;
        });
    }
    const stdoutEnded = cancel ? undefined : once(child.stdout, 'end');
    const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'skill_read_rankings' } },
        { jsonrpc: '2.0', id: 3, method: 'ping' },
    ]
        .map((request) => JSON.stringify(request) + '\n')
        .join('');
    if (cancel) child.stdin.write(requests);
    else child.stdin.end(requests);

    const [code, signal] = await exited;
    await stderrEnded;
    await stdoutEnded;
    assert.equal(signal, null, `server must exit without the timeout killing it: ${stderr}`);
    assert.equal(code, 0, stderr);
    return { summary: JSON.parse(stderr), stdout };
}

for (const initializeStdout of [false, true]) {
    test(
        `default POSIX stdout cancellation exits with an unread pipe (initialized: ${initializeStdout})`,
        { skip: process.platform === 'win32', timeout: 8000 },
        async (t) => {
            const { summary } = await stdioFixture(t, { cancel: true, initializeStdout });
            assert.deepEqual(summary, { closed: 1, rankings: 1, stdoutWrites: 0 });
        },
    );

    test(
        `orderly stdio EOF preserves complete responses exactly once (initialized: ${initializeStdout})`,
        { timeout: 8000 },
        async (t) => {
            const { summary, stdout } = await stdioFixture(t, { cancel: false, initializeStdout });
            const responses = stdout.trim().split('\n').map(JSON.parse);
            assert.deepEqual(
                responses.map((response) => response.id),
                [1, 2, 3],
            );
            assert.equal(responses[1].result.structuredContent.rows[0], 'x'.repeat(256 * 1024));
            assert.equal(summary.closed, 1);
            if (process.platform !== 'win32') assert.equal(summary.stdoutWrites, 0);
        },
    );
}

test(
    'Windows stdout selection retains the original stream without wrapping its descriptor',
    { timeout: 8000 },
    async (t) => {
        const { summary, stdout } = await stdioFixture(t, {
            cancel: false,
            initializeStdout: true,
            windowsFallback: true,
        });
        assert.equal(summary.stdoutWrites, 3);
        assert.deepEqual(
            stdout
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line).id),
            [1, 2, 3],
        );
    },
);
