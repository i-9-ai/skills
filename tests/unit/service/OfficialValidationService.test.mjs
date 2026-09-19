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
