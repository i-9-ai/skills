// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { OfficialQualityValidator } from '../../../src/validator/OfficialQualityValidator.ts';

const validator = new OfficialQualityValidator();
const invalid = (error) => error?.code === 'invalid_input';
function request() {
    return {
        collection: 'demo',
        skill: 'example-skill',
        source: {
            repository: 'https://example.org/skills',
            source_ref: null,
            resolved_git_sha: 'a'.repeat(40),
            package_path: '.agents/skills/example-skill',
            package_sha256: 'b'.repeat(64),
        },
    };
}
function artifact() {
    const selected = request();
    const fingerprint = { package_sha256: selected.source.package_sha256, files: 2, bytes: 40 };
    return {
        schema_version: 1,
        event_id: '11111111-1111-4111-8111-111111111111',
        correlation_id: '22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-10-04T00:00:00.000Z',
        ...selected,
        method: {
            name: 'skills-ref',
            version: '0.1.0',
            revision: 'c'.repeat(40),
            source_sha256: 'd'.repeat(64),
        },
        setup: 'completed',
        version_check: { status: 'matched', observed_version: '0.1.0' },
        process: { status: 'completed', exit_code: 0, signal: null },
        before: { ...fingerprint },
        after: { ...fingerprint },
        result: 'pass',
        reason: 'conformance_pass',
    };
}
const reverse = (value) =>
    value && typeof value === 'object'
        ? Object.fromEntries(
              Object.entries(value)
                  .reverse()
                  .map(([key, item]) => [key, reverse(item)]),
          )
        : value;

test('request is exactly bounded collection/skill/source and the canonical requested package', () => {
    assert.deepEqual(validator.request(reverse(request())), request());
    for (const mutate of [
        (v) => {
            v.assurance = 'observed';
        },
        (v) => {
            v.result = 'pass';
        },
        (v) => {
            v.method = {};
        },
        (v) => {
            v.source.package_path = 'skills/example-skill';
        },
        (v) => {
            v.source.package_path = '.agents/skills/other-skill';
        },
        (v) => {
            v.skill = 'generated-scaffold';
            v.source.package_path = '.agents/skills/generated-scaffold';
        },
        (v) => {
            v.source.repository = 'https://127.0.0.1/skills';
        },
        (v) => {
            v.source.package_sha256 = 'wrong';
        },
        (v) => {
            v.raw = 'x'.repeat(16_384);
        },
    ]) {
        const value = request();
        mutate(value);
        assert.throws(() => validator.request(value), invalid);
    }
});

test('artifact normalization is deterministic and closed, without physical or raw process fields', () => {
    const normalized = validator.artifact(artifact(), request());
    assert.deepEqual(validator.artifact(reverse(normalized), reverse(request())), normalized);
    assert.equal(Object.hasOwn(normalized, 'assurance'), false);
    for (const [field, value] of [
        ['stdout', 'private output'],
        ['stderr', 'private error'],
        ['error', 'physical path'],
        ['package_root', '/synthetic/root'],
        ['prompt', 'private prompt'],
        ['assurance', 'locally_observed_official_process'],
        ['raw', 'x'.repeat(16_384)],
    ]) {
        const input = artifact();
        input[field] = value;
        assert.throws(() => validator.artifact(input, request()), invalid);
    }
});

test('subject and pre-invocation fingerprint must match the separately validated request', () => {
    for (const mutate of [
        (v) => {
            v.collection = 'other';
        },
        (v) => {
            v.skill = 'other-skill';
            v.source.package_path = '.agents/skills/other-skill';
        },
        (v) => {
            v.source.repository = 'https://another.example.org/skills';
        },
        (v) => {
            v.before.package_sha256 = 'f'.repeat(64);
        },
        (v) => {
            v.event_id = 'not-a-uuid';
        },
        (v) => {
            v.occurred_at = 'yesterday';
        },
        (v) => {
            v.before.files = 2049;
        },
        (v) => {
            v.after.bytes = 33_554_433;
        },
    ]) {
        const value = artifact();
        mutate(value);
        assert.throws(() => validator.artifact(value, request()), invalid);
    }
});

test('changed/unknown post-fingerprint can only produce blocked evidence, never pass', () => {
    for (const field of ['package_sha256', 'files', 'bytes']) {
        const value = artifact();
        value.after[field] = field === 'package_sha256' ? 'f'.repeat(64) : value.after[field] + 1;
        assert.throws(() => validator.artifact(value, request()), invalid);
        value.result = 'blocked';
        value.reason = 'package_changed';
        assert.equal(validator.artifact(value, request()).reason, 'package_changed');
    }
    const value = artifact();
    value.after = null;
    assert.throws(() => validator.artifact(value, request()), invalid);
    value.result = 'blocked';
    value.reason = 'package_after_unavailable';
    assert.equal(validator.artifact(value, request()).result, 'blocked');
});

test('completed exit determines conformance and every noncompleted outcome remains blocked', () => {
    const failed = artifact();
    failed.process.exit_code = 1;
    assert.throws(() => validator.artifact(failed, request()), invalid);
    failed.result = 'fail';
    failed.reason = 'conformance_fail';
    assert.equal(validator.artifact(failed, request()).result, 'fail');
    for (const [outcome, reason, signal] of [
        ['timeout', 'process_timeout', 'SIGTERM'],
        ['unavailable', 'process_unavailable', null],
        ['interrupted', 'process_interrupted', 'SIGINT'],
        ['execution_error', 'process_execution_error', 'other'],
    ]) {
        const value = artifact();
        value.process = { status: outcome, exit_code: null, signal };
        assert.throws(() => validator.artifact(value, request()), invalid);
        value.result = 'blocked';
        value.reason = reason;
        assert.equal(validator.artifact(value, request()).reason, reason);
    }
    for (const process of [
        { status: 'completed', exit_code: null, signal: null },
        { status: 'completed', exit_code: 0, signal: 'SIGTERM' },
        { status: 'unavailable', exit_code: 1, signal: null },
        { status: 'completed', exit_code: -1, signal: null },
        { status: 'completed', exit_code: 0.5, signal: null },
        { status: 'completed', exit_code: 4_294_967_296, signal: null },
        { status: 'completed', exit_code: 0, signal: 'raw-signal' },
    ])
        assert.throws(() => validator.artifact({ ...artifact(), process }, request()), invalid);
});

test('setup and observed configured-version status explicitly prevent unperformed passes', () => {
    for (const [setup, reason] of [
        ['not-run', 'setup_not_run'],
        ['unavailable', 'setup_unavailable'],
    ]) {
        const value = artifact();
        value.setup = setup;
        value.version_check = { status: 'not-run', observed_version: null };
        value.process = { status: 'unavailable', exit_code: null, signal: null };
        assert.throws(() => validator.artifact(value, request()), invalid);
        value.result = 'blocked';
        value.reason = reason;
        assert.equal(validator.artifact(value, request()).reason, reason);
    }
    for (const [status, observed_version, reason] of [
        ['mismatch', '0.2.0', 'version_mismatch'],
        ['mismatch', null, 'version_mismatch'],
        ['unavailable', null, 'version_unavailable'],
        ['not-run', null, 'version_not_run'],
    ]) {
        const value = artifact();
        value.version_check = { status, observed_version };
        value.process = { status: 'unavailable', exit_code: null, signal: null };
        value.result = 'blocked';
        value.reason = reason;
        assert.equal(validator.artifact(value, request()).reason, reason);
    }
    for (const mutate of [
        (v) => {
            v.version_check.observed_version = '0.2.0';
        },
        (v) => {
            v.version_check.status = 'mismatch';
        },
        (v) => {
            v.setup = 'not-run';
        },
        (v) => {
            v.method.name = 'other-tool';
        },
        (v) => {
            v.method.revision = 'main';
        },
        (v) => {
            v.method.source_sha256 = 'bad';
        },
        (v) => {
            v.method.version = '/physical/path';
        },
    ]) {
        const value = artifact();
        mutate(value);
        assert.throws(() => validator.artifact(value, request()), invalid);
    }
});
