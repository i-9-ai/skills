// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { OfficialValidationService } from '../../../src/service/OfficialValidationService.ts';

test('official validation stops before external effects when local precheck fails', () => {
    const calls = [];
    const collection = {
        validateRepository() {
            calls.push('local');
            throw new Error('invalid collection');
        },
    };
    const validator = {
        officialRequirements() {
            calls.push('configuration');
        },
    };
    const service = new OfficialValidationService(collection, validator, {});

    assert.throws(() => service.validateOfficial('/synthetic'), /invalid collection/);
    assert.deepEqual(calls, ['local']);
});

test('official orchestration uses reviewed requirements and one ordered process boundary', () => {
    const calls = [];
    const requirements = { version: '1.0', phases: [] };
    const packages = [{ name: 'example', path: '/synthetic/example' }];
    const collection = {
        validateRepository(root) {
            calls.push(['local', root]);
        },
    };
    const validator = {
        officialRequirements(config) {
            assert.equal(config, 'pins');
            return requirements;
        },
    };
    const repository = {
        readOfficialConfiguration() {
            calls.push('config');
            return 'pins';
        },
        canonicalSkills() {
            calls.push('discover');
            return packages;
        },
        installOfficialValidator(root, received) {
            assert.equal(received, requirements);
            calls.push('install');
        },
        runOfficialValidator(root, received, version) {
            assert.equal(received, packages);
            assert.equal(version, '1.0');
            calls.push('validate');
            return [{ name: 'example', passed: true }];
        },
    };

    const result = new OfficialValidationService(
        collection,
        validator,
        repository,
    ).validateOfficial('/synthetic');
    assert.deepEqual(calls, [['local', '/synthetic'], 'config', 'discover', 'install', 'validate']);
    assert.equal(result[0].passed, true);
});

function observedService(calls, installFailure) {
    const requirements = {
        version: '1.0',
        method: {
            name: 'skills-ref',
            version: '1.0',
            revision: 'a'.repeat(40),
            source_sha256: 'b'.repeat(64),
        },
        phases: [{ content: 'reviewed requirement', flags: ['--no-deps'] }],
    };
    const packages = [{ name: 'example', path: '/synthetic/example' }];
    const service = new OfficialValidationService(
        { validateRepository: () => calls.push('local') },
        { officialRequirements: () => requirements },
        {
            readOfficialConfiguration: () => {
                calls.push('configuration');
                return {};
            },
            canonicalSkills: () => {
                calls.push('discover');
                return packages;
            },
            installOfficialValidator: (_root, received) => {
                assert.equal(received, requirements);
                calls.push('install');
                if (installFailure) throw installFailure;
            },
            runOfficialValidator: (_root, received, version, execute, callbacks) => {
                assert.equal(received, packages);
                assert.equal(version, requirements.version);
                assert.equal(execute, undefined);
                calls.push('run');
                callbacks.onVersion?.({
                    state: 'verified',
                    observed_version: version,
                    process: { status: 'completed', exit_code: 0, signal: null },
                });
                return [{ name: 'example', passed: true, diagnostic: '' }];
            },
        },
    );
    return { service, requirements, packages };
}

test('observation preflight receives immutable reviewed identities before any setup', () => {
    const calls = [];
    const { service, requirements, packages } = observedService(calls);
    const result = service.validateOfficial('/synthetic', {
        beforeSetup(received, skills) {
            calls.push('preflight');
            assert.deepEqual(received, requirements);
            assert.deepEqual(skills, packages);
            assert.notEqual(received, requirements);
            assert.notEqual(skills, packages);
            assert.ok(Object.isFrozen(received));
            assert.ok(Object.isFrozen(received.method));
            assert.ok(Object.isFrozen(received.phases[0].flags));
            assert.ok(Object.isFrozen(skills[0]));
            assert.throws(() => {
                received.method.version = 'changed';
            }, TypeError);
            assert.throws(() => {
                skills[0].path = '/different';
            }, TypeError);
        },
        onSetup: (state) => calls.push(state),
        onVersion: (state) => calls.push(state.state),
    });
    assert.deepEqual(calls, [
        'local',
        'configuration',
        'discover',
        'preflight',
        'started',
        'install',
        'completed',
        'run',
        'verified',
    ]);
    assert.deepEqual(result, [{ name: 'example', passed: true, diagnostic: '' }]);
    assert.equal(requirements.method.version, '1.0');
    assert.equal(packages[0].path, '/synthetic/example');
});

test('preflight refusal stops before setup or any external process', () => {
    const calls = [];
    const { service } = observedService(calls);
    assert.throws(
        () =>
            service.validateOfficial('/synthetic', {
                beforeSetup() {
                    throw new Error('observation root refused');
                },
                onSetup: (state) => calls.push(state),
            }),
        /observation root refused/,
    );
    assert.deepEqual(calls, ['local', 'configuration', 'discover']);
});

test('setup failure is observable and preserves the ordinary error if its observer fails', () => {
    const calls = [];
    const failure = new Error('Official validator setup failed; later phases were not run.');
    const { service } = observedService(calls, failure);
    assert.throws(
        () =>
            service.validateOfficial('/synthetic', {
                onSetup(state) {
                    calls.push(state);
                    if (state === 'setup_failed') throw new Error('metadata write failed');
                },
                onVersion() {
                    assert.fail('version must not run after failed setup');
                },
            }),
        (error) => error === failure,
    );
    assert.deepEqual(calls, [
        'local',
        'configuration',
        'discover',
        'started',
        'install',
        'setup_failed',
    ]);
});

test('setup observer exceptions prevent subsequent setup or validation', () => {
    for (const rejected of ['started', 'completed']) {
        const calls = [];
        const { service } = observedService(calls);
        assert.throws(
            () =>
                service.validateOfficial('/synthetic', {
                    onSetup(state) {
                        calls.push(state);
                        if (state === rejected) throw new Error('observer stopped');
                    },
                }),
            /observer stopped/,
        );
        assert.equal(calls.includes('install'), rejected === 'completed');
        assert.equal(calls.includes('run'), false);
        assert.equal(calls.includes('setup_failed'), false);
    }
});
