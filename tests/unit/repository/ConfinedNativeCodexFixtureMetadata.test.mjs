// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { ConfinedNativeCodexRepository } from '../../../src/repository/ConfinedNativeCodexRepository.ts';
import { LoopbackResponsesFixture } from '../../../src/transport/LoopbackResponsesFixture.ts';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(rawHeaders = ['Content-Type', 'application/json']) {
    let server;
    class OwnedFake extends ConfinedNativeCodexRepository {
        boundary() {}
    }
    const repository = new OwnedFake({
        server(handler) {
            server = new EventEmitter();
            server.on('request', handler);
            server.listen = (_options, ready) => {
                server.listening = true;
                ready();
            };
            server.address = () => ({ address: '127.0.0.1', port: 12345 });
            server.close = (done) => {
                server.listening = false;
                done?.();
            };
            return server;
        },
    });
    const local = new LoopbackResponsesFixture();
    const host = await repository.fixture.start(local.handle, {
        address: '127.0.0.1',
        requests: 1,
        bodyBytes: 1_048_576,
        timeoutMs: 10_000,
    });
    const request = new EventEmitter();
    request.method = 'POST';
    request.url = '/v1/responses';
    request.rawHeaders = rawHeaders;
    request.headers = Object.fromEntries(
        rawHeaders.reduce(
            (rows, value, index) =>
                index % 2 ? rows : [...rows, [value.toLowerCase(), rawHeaders[index + 1]]],
            [],
        ),
    );
    request.setTimeout = () => {};
    request.destroy = () => {};
    let response;
    server.emit('request', request, {
        writeHead(status, headers) {
            response = { status, headers };
        },
        end(bytes) {
            response.body = bytes;
        },
        destroy() {},
    });
    const body = Buffer.from(
        JSON.stringify({
            model: 'native-pilot-fixture',
            input: [],
            store: false,
            stream: true,
            tools: [],
        }),
    );
    request.emit('data', body);
    request.emit('end');
    await host.close();
    return { repository, body, response };
}

test('actual synthetic HTTP fields and exact body/reply hashes are retained without real sockets', async () => {
    const f = await fixture();
    assert.equal(f.repository.fixtureExchanges.length, 1);
    const row = f.repository.fixtureExchanges[0];
    assert.equal(row.method, 'POST');
    assert.equal(row.path, '/v1/responses');
    assert.deepEqual(row.raw_headers, ['Content-Type', 'application/json']);
    assert.equal(row.request_sha256, sha(f.body));
    assert.equal(row.request_bytes, f.body.length);
    assert.equal(row.response_sha256, sha(f.response.body));
    assert.equal(row.response_bytes, f.response.body.length);
    assert.equal(row.status, 200);
    assert.deepEqual(row.response_headers, f.response.headers);
    assert.equal(f.repository.processEvents.length, 0);
});

test('a rejected credential header is retained as rejected status and cannot become a successful exchange', async () => {
    const f = await fixture(['Authorization', 'synthetic-control-value']);
    assert.equal(f.repository.fixtureExchanges[0].status, 400);
    assert.equal(f.response.status, 400);
});

test('duplicate HTTP header names are rejected before any success metadata', async () => {
    const f = await fixture([
        'Content-Type',
        'application/json',
        'content-type',
        'application/json',
    ]);
    assert.equal(f.response.status, 400);
    assert.deepEqual(f.repository.fixtureExchanges, []);
});
