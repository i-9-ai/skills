// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { ConfinedNativeCodexRepository } from '../../../src/repository/ConfinedNativeCodexRepository.ts';
import { NativePilotCodexObservationService } from '../../../src/service/NativePilotCodexObservationService.ts';
import { LoopbackResponsesFixture } from '../../../src/transport/LoopbackResponsesFixture.ts';
import { fixture } from '../../helpers/NativeCodexMeasuredFixture.mjs';
import { validator } from '../../helpers/NativeCodexTranscriptFixture.mjs';

test('retained total counts rejected requests as well as the sole accepted exchange', async () => {
    const f = await fixture(1);
    let server;
    class FakeBoundary extends ConfinedNativeCodexRepository {
        boundary() {}
    }
    const repository = new FakeBoundary({
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
    const policy = new LoopbackResponsesFixture();
    const host = await repository.fixture.start(policy.handle, {
        address: '127.0.0.1',
        requests: 1,
        bodyBytes: 1048576,
        timeoutMs: 10000,
    });
    const statuses = [];
    const send = () => {
        const request = new EventEmitter();
        Object.assign(request, {
            method: 'POST',
            url: '/v1/responses',
            rawHeaders: ['Content-Type', 'application/json'],
            headers: { 'content-type': 'application/json' },
            setTimeout() {},
            destroy() {},
        });
        server.emit('request', request, {
            writeHead(status) {
                statuses.push(status);
            },
            end() {},
            destroy() {},
        });
        request.emit('data', f.selected.fixture_request);
        request.emit('end');
    };
    try {
        send();
        send();
        assert.deepEqual(statuses, [200, 400]);
        assert.equal(repository.fixtureRequestCount, 2);
        assert.equal(repository.fixtureExchanges.length, 1);
        await assert.rejects(host.close(), /fixture_request_count/);
        f.selected.fixture_metadata = {
            schema_version: 2,
            request_count: repository.fixtureRequestCount,
            exchanges: repository.fixtureExchanges,
        };
        await assert.rejects(
            new NativePilotCodexObservationService(validator).validate(f.selected),
            /projection_fixture_metadata/,
        );
    } finally {
        f.remove();
    }
});
