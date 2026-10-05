// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NativeClaudeRawProcessRepository } from '../../../src/repository/NativeClaudeRawProcessRepository.ts';
import { NativeClaudeProcessIdentityValidator } from '../../../src/validator/NativeClaudeProcessIdentityValidator.ts';

const pid = 140;
const observer = 90;
const executable = '/pilot/runtime-bin/claude';
const codec = new NativeClaudeProcessIdentityValidator();
const stat = ({ parent = observer, ticks = '12345', state = 'S', selectedPid = pid } = {}) => {
    const fields = [state, String(parent), ...Array(48).fill('0')];
    fields[19] = ticks;
    return Buffer.from(`${selectedPid} (claude) ${fields.join(' ')}\n`);
};

function collect(before, after, selectedExecutable = executable) {
    const calls = [];
    let index = 0;
    const repository = new NativeClaudeRawProcessRepository({
        child: {
            stat(selectedPid) {
                calls.push(['stat', selectedPid]);
                const value = [before, after][index++];
                if (value instanceof Error) throw value;
                return value;
            },
            executable(selectedPid) {
                calls.push(['exe', selectedPid]);
                return selectedExecutable;
            },
        },
    });
    // Invoke only the internal metadata sampler with injected bytes. No spawn/context/proc access.
    return { identity: repository.captureChildIdentity(pid, observer), calls };
}

for (const [name, before, after] of [
    ['foreign parent', stat({ parent: 1 }), stat({ parent: 1 })],
    ['changed parent', stat(), stat({ parent: 1 })],
    ['changed start ticks', stat(), stat({ ticks: '12346' })],
    ['zombie first sample', stat({ state: 'Z' }), stat()],
    ['zombie second sample', stat(), stat({ state: 'Z' })],
    ['invalid second sample', stat(), Buffer.from('not a Linux stat\n')],
    ['different second PID', stat(), stat({ selectedPid: 141 })],
]) {
    test(`collector retains both samples but refuses ${name}`, () => {
        const { identity, calls } = collect(before, after);
        assert.equal(identity.schema_version, 2);
        assert.equal(identity.status, 'invalid');
        assert.equal(identity.start_ticks, null);
        assert.equal(identity.observer_pid, observer);
        assert.equal(identity.stat_before.base64, before.toString('base64'));
        assert.equal(identity.stat_after.base64, after.toString('base64'));
        assert.deepEqual(calls, [
            ['stat', pid],
            ['exe', pid],
            ['stat', pid],
        ]);
        assert.equal(codec.validate(identity, observer), null);
    });
    test(`pure identity replay refuses forged observed flag for ${name}`, () => {
        const value = {
            schema_version: 2,
            status: 'observed',
            pid,
            observer_pid: observer,
            start_ticks: '12345',
            executable,
            stat_before: codec.receipt(before),
            stat_after: codec.receipt(after),
        };
        assert.equal(codec.validate(value, observer), null);
    });
}

test('valid live double samples bind the actual expected parent and stable ticks', () => {
    const { identity } = collect(stat({ state: 'R' }), stat({ state: 'S' }));
    assert.equal(identity.status, 'observed');
    assert.notEqual(identity.stat_before.sha256, identity.stat_after.sha256);
    assert.deepEqual(codec.validate(identity, observer), {
        pid,
        observer_pid: observer,
        start_ticks: '12345',
    });
    assert.equal(codec.validate(identity, 1), null);
    assert.equal(codec.validate({ ...identity, observer_pid: 1 }, observer), null);
});

test('fast exit on the second read retains the first sample as unavailable', () => {
    const { identity } = collect(stat(), new Error('injected vanished proc entry'));
    assert.equal(identity.status, 'unavailable');
    assert.ok(identity.stat_before);
    assert.equal(identity.stat_after, null);
    assert.equal(identity.start_ticks, null);
    assert.equal(codec.validate(identity, observer), null);
});

test('wrong executable or changed retained receipt cannot become a valid child', () => {
    assert.equal(collect(stat(), stat(), '/pilot/runtime-bin/other').identity.status, 'invalid');
    const value = collect(stat(), stat()).identity;
    assert.equal(
        codec.validate(
            { ...value, stat_after: { ...value.stat_after, sha256: '0'.repeat(64) } },
            observer,
        ),
        null,
    );
    assert.equal(codec.validate({ ...value, schema_version: 1 }, observer), null);
});

test('each stat sample is independently bounded and malformed bytes cannot establish ownership', () => {
    assert.throws(() => codec.receipt(Buffer.alloc(4097)), /bound/);
    assert.equal(collect(stat(), Buffer.alloc(4097)).identity.status, 'unavailable');
    assert.equal(collect(stat(), Buffer.from([255])).identity.status, 'invalid');
});
