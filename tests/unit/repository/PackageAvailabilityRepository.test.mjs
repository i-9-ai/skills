// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
    PACKAGE_AVAILABILITY_LIMITS,
    PackageAvailabilityError,
    PackageAvailabilityRepository,
} from '../../../src/repository/PackageAvailabilityRepository.ts';

const identity = { name: '@example/fixture', version: '1.2.3' };
const published = JSON.stringify([identity]);
const tarball = Buffer.from('Disposable synthetic package bytes.');
const integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const tarballUrl = 'https://registry.npmjs.org/@example/fixture/-/fixture-1.2.3.tgz';

function metadata(overrides = {}) {
    return {
        ...identity,
        dist: { tarball: tarballUrl, integrity: integrity(tarball) },
        ...overrides,
    };
}

function json(value, options) {
    return new Response(JSON.stringify(value), options);
}

function fixture(fetch, limits = {}) {
    let now = 0;
    const requests = [];
    const waits = [];
    const repository = new PackageAvailabilityRepository({
        fetch: async (url, options) => {
            requests.push({ url, options });
            return fetch(url, options, requests.length);
        },
        now: () => now,
        wait: async (milliseconds) => {
            waits.push(milliseconds);
            now += milliseconds;
        },
        limits: {
            deadlineMs: 100,
            requestTimeoutMs: 50,
            retryDelayMs: 10,
            attempts: 10,
            metadataBytes: 4096,
            tarballBytes: 1024,
            ...limits,
        },
    });
    return { repository, requests, waits };
}

function errorCode(code) {
    return (error) => {
        assert.ok(error instanceof PackageAvailabilityError);
        assert.equal(error.code, code);
        return true;
    };
}

test('fixed probe bounds cannot be raised or disabled through constructor overrides', () => {
    assert.equal(PACKAGE_AVAILABILITY_LIMITS.deadlineMs, 900000);
    assert.equal(PACKAGE_AVAILABILITY_LIMITS.requestTimeoutMs, 15000);
    assert.equal(PACKAGE_AVAILABILITY_LIMITS.retryDelayMs, 10000);
    assert.equal(PACKAGE_AVAILABILITY_LIMITS.attempts, 91);
    assert.equal(PACKAGE_AVAILABILITY_LIMITS.metadataBytes, 512 * 1024);
    assert.equal(PACKAGE_AVAILABILITY_LIMITS.tarballBytes, 64 * 1024 * 1024);
    for (const [name, value] of Object.entries(PACKAGE_AVAILABILITY_LIMITS)) {
        for (const invalid of [0, -1, value + 1, Infinity, NaN, 1.5]) {
            assert.throws(
                () => new PackageAvailabilityRepository({ limits: { [name]: invalid } }),
                errorCode('invalid_limits'),
            );
        }
    }
});

test('delayed metadata and tarballs are retried before exact-version integrity succeeds', async () => {
    let metadataCalls = 0;
    let tarballCalls = 0;
    const input = fixture((url) => {
        if (url === tarballUrl) {
            tarballCalls += 1;
            return tarballCalls === 1 ? new Response('', { status: 404 }) : new Response(tarball);
        }
        metadataCalls += 1;
        return metadataCalls <= 2
            ? new Response('', { status: metadataCalls === 1 ? 404 : 503 })
            : json(metadata());
    });
    const result = await input.repository.verifyPublished(published, identity);
    assert.equal(result.status, 'available');
    assert.deepEqual(result.package, identity);
    assert.equal(result.registry_metadata, 'verified');
    assert.deepEqual(result.tarball, {
        url: tarballUrl,
        integrity: integrity(tarball),
        bytes: tarball.length,
    });
    assert.equal(result.installed_runtime, 'not_checked');
    assert.equal(result.attempts, 4);
    assert.equal(result.elapsed_ms, 30);
    assert.deepEqual(input.waits, [10, 10, 10]);
    for (const request of input.requests) {
        assert.ok(
            ['https://registry.npmjs.org/%40example%2Ffixture/1.2.3', tarballUrl].includes(
                request.url,
            ),
        );
        assert.equal(request.options.method, 'GET');
        assert.equal(request.options.credentials, 'omit');
        assert.equal(request.options.redirect, 'manual');
        assert.deepEqual(Object.keys(request.options.headers), ['Accept']);
        assert.equal(request.options.signal.aborted, true);
    }
});

test('publication output rejects missing, malformed, unrelated and oversized identities before HTTP', async () => {
    const input = fixture(() => {
        assert.fail('invalid publication identities must not issue requests');
    });
    for (const value of [undefined, 'not-json', ' '.repeat(8193)]) {
        await assert.rejects(
            input.repository.verifyPublished(value, identity),
            errorCode('invalid_publication_output'),
        );
    }
    for (const value of [
        '[]',
        '{}',
        'null',
        '[null]',
        '[1]',
        JSON.stringify([identity, identity]),
        JSON.stringify([{ ...identity, name: '@example/other' }]),
        JSON.stringify([{ ...identity, version: '1.2.4' }]),
        JSON.stringify([{ ...identity, private: false }]),
    ]) {
        await assert.rejects(
            input.repository.verifyPublished(value, identity),
            errorCode('publication_identity_mismatch'),
        );
    }
    for (const expected of [
        { ...identity, name: 'https://example.invalid/' },
        { ...identity, version: 'latest' },
    ]) {
        await assert.rejects(
            input.repository.verifyPublished(published, expected),
            errorCode('invalid_publication_output'),
        );
    }
    assert.equal(input.requests.length, 0);
});

test('wrong metadata name or version fails immediately without trying a tarball', async () => {
    for (const overrides of [{ name: '@example/other' }, { version: '1.2.4' }]) {
        const input = fixture(() => json(metadata(overrides)));
        await assert.rejects(
            input.repository.verifyPublished(published, identity),
            errorCode('metadata_identity_mismatch'),
        );
        assert.equal(input.requests.length, 1);
        assert.deepEqual(input.waits, []);
    }
});

test('advertised tarball locations cannot redirect the probe or select another artifact', async () => {
    for (const url of [
        'http://registry.npmjs.org/@example/fixture/-/fixture-1.2.3.tgz',
        'https://example.invalid/@example/fixture/-/fixture-1.2.3.tgz',
        'https://sentinel@registry.npmjs.org/@example/fixture/-/fixture-1.2.3.tgz',
        `${tarballUrl}?access=sentinel`,
        `${tarballUrl}#sentinel`,
        tarballUrl.replace('1.2.3', '1.2.4'),
        'https://registry.npmjs.org/%FF',
        undefined,
    ]) {
        const input = fixture(() =>
            json(
                metadata({
                    dist: { tarball: url, integrity: integrity(tarball) },
                }),
            ),
        );
        await assert.rejects(
            input.repository.verifyPublished(published, identity),
            errorCode('invalid_tarball_url'),
        );
        assert.equal(input.requests.length, 1);
        assert.deepEqual(input.waits, []);
    }
});

test('metadata requires canonical SHA-512 integrity rather than guessing a fallback', async () => {
    for (const value of [
        undefined,
        '',
        'sha1-AAAA',
        integrity(tarball) + ' ' + integrity(tarball),
        'sha512-' + 'A'.repeat(85) + 'B==',
    ]) {
        const input = fixture(() =>
            json(metadata({ dist: { tarball: tarballUrl, integrity: value } })),
        );
        await assert.rejects(
            input.repository.verifyPublished(published, identity),
            errorCode('invalid_integrity'),
        );
        assert.equal(input.requests.length, 1);
    }
});

test('a changing advertised integrity fails after a visibility delay', async () => {
    let observations = 0;
    const input = fixture((url) => {
        if (url === tarballUrl) return new Response('', { status: 404 });
        observations += 1;
        return json(
            metadata({
                dist: {
                    tarball: tarballUrl,
                    integrity:
                        observations === 1 ? integrity(tarball) : integrity(Buffer.from('other')),
                },
            }),
        );
    });
    await assert.rejects(input.repository.verifyPublished(published, identity), (error) => {
        errorCode('integrity_changed')(error);
        assert.equal(error.attempts, 2);
        return true;
    });
    assert.equal(input.requests.length, 3);
});

test('downloaded bytes that disagree with advertised integrity fail without retry or publication', async () => {
    const input = fixture((url) =>
        url === tarballUrl ? new Response('Different synthetic bytes') : json(metadata()),
    );
    await assert.rejects(input.repository.verifyPublished(published, identity), (error) => {
        errorCode('integrity_mismatch')(error);
        assert.equal(error.attempts, 1);
        return true;
    });
    assert.equal(input.requests.length, 2);
    assert.deepEqual(input.waits, []);
});

test('body limits reject declared and streamed oversized metadata or tarballs', async () => {
    for (const length of ['513', '-1', 'invalid']) {
        const input = fixture(() => json(metadata(), { headers: { 'content-length': length } }), {
            metadataBytes: 512,
        });
        await assert.rejects(
            input.repository.verifyPublished(published, identity),
            errorCode('response_body_limit'),
        );
    }
    const stream = () =>
        new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(300));
                controller.enqueue(new Uint8Array(300));
                controller.close();
            },
        });
    const metadataInput = fixture(() => new Response(stream()), { metadataBytes: 512 });
    await assert.rejects(
        metadataInput.repository.verifyPublished(published, identity),
        errorCode('response_body_limit'),
    );
    const tarballInput = fixture(
        (url) => (url === tarballUrl ? new Response(stream()) : json(metadata())),
        { tarballBytes: 512 },
    );
    await assert.rejects(
        tarballInput.repository.verifyPublished(published, identity),
        errorCode('response_body_limit'),
    );
});

test('authentication errors and HTTP redirects fail immediately and omit remote diagnostics', async () => {
    const sentinel = ['private', 'server', 'diagnostic'].join('-');
    for (const status of [301, 302, 400, 401, 403]) {
        const input = fixture(
            () =>
                new Response(sentinel, {
                    status,
                    headers: { Location: 'https://example.invalid/' },
                }),
        );
        await assert.rejects(input.repository.verifyPublished(published, identity), (error) => {
            errorCode('registry_response_rejected')(error);
            assert.equal(error.message.includes(sentinel), false);
            return true;
        });
        assert.equal(input.requests.length, 1);
        assert.deepEqual(input.waits, []);
    }
});

test('unavailable artifacts stop at the total deadline with the last bounded observation', async () => {
    const input = fixture(() => new Response('', { status: 404 }), {
        deadlineMs: 25,
        attempts: 91,
    });
    await assert.rejects(input.repository.verifyPublished(published, identity), (error) => {
        errorCode('availability_timeout')(error);
        assert.equal(error.attempts, 3);
        assert.equal(error.elapsedMs, 25);
        assert.equal(error.lastObservation, 'metadata_http_404');
        assert.match(error.message, /Publication completed/u);
        return true;
    });
    assert.deepEqual(input.waits, [10, 10, 5]);
    assert.equal(input.requests.length, 3);
});

test('request and body timeouts terminate even when an injected HTTP operation ignores abort', async () => {
    for (const fetch of [
        () => new Promise(() => {}),
        () => Promise.resolve(new Response(new ReadableStream({ start() {} }))),
    ]) {
        const signals = [];
        const repository = new PackageAvailabilityRepository({
            fetch: (url, options) => {
                signals.push(options.signal);
                return fetch();
            },
            limits: { deadlineMs: 200, requestTimeoutMs: 5, retryDelayMs: 1, attempts: 2 },
        });
        await assert.rejects(repository.verifyPublished(published, identity), (error) => {
            errorCode('availability_timeout')(error);
            assert.ok(error.attempts <= 2);
            assert.equal(error.lastObservation, 'metadata_request_timeout');
            return true;
        });
        assert.ok(signals.every((signal) => signal.aborted));
    }
});

test('completed, oversized and timed-out response streams release their readers', async () => {
    const responses = [];
    const success = fixture((url) => {
        const response = url === tarballUrl ? new Response(tarball) : json(metadata());
        responses.push(response);
        return response;
    });
    await success.repository.verifyPublished(published, identity);
    assert.ok(responses.every((response) => !response.body.locked));

    for (const oversized of [true, false]) {
        let cancellations = 0;
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    if (oversized) controller.enqueue(new Uint8Array(600));
                },
                cancel() {
                    cancellations += 1;
                },
            }),
        );
        const repository = new PackageAvailabilityRepository({
            fetch: async () => response,
            limits: {
                deadlineMs: 200,
                requestTimeoutMs: 5,
                metadataBytes: 512,
                attempts: 1,
            },
        });
        await assert.rejects(
            repository.verifyPublished(published, identity),
            errorCode(oversized ? 'response_body_limit' : 'availability_timeout'),
        );
        assert.equal(response.body.locked, false);
        assert.equal(cancellations, 1);
    }
});

test('malformed metadata is rejected and transport errors retry without exposing error data', async () => {
    const malformed = fixture(() => new Response('not JSON'));
    await assert.rejects(
        malformed.repository.verifyPublished(published, identity),
        errorCode('invalid_metadata'),
    );
    const sentinel = ['synthetic', 'secret', 'marker'].join('-');
    const input = fixture(
        () => {
            throw new Error(sentinel);
        },
        { attempts: 2 },
    );
    await assert.rejects(input.repository.verifyPublished(published, identity), (error) => {
        errorCode('availability_timeout')(error);
        assert.equal(error.lastObservation, 'metadata_request_failed');
        assert.equal(error.message.includes(sentinel), false);
        return true;
    });
    assert.equal(input.requests.length, 2);
});
