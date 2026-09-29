// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { SkillUsageMcpTransport } from '../../../src/transport/SkillUsageMcpTransport.ts';

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
    const done = new SkillUsageMcpTransport().startServer(store, input, output);
    return {
        input,
        done,
        calls,
        responses: () => text.trim().split('\n').filter(Boolean).map(JSON.parse),
    };
}

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
    running.input.end('x'.repeat(65537));
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
    const done = new SkillUsageMcpTransport().startServer(
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
    const done = new SkillUsageMcpTransport().startServer(
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
