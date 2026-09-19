// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
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
