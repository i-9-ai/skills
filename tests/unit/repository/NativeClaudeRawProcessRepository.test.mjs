// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { NativeClaudeRawProcessRepository } from '../../../src/repository/NativeClaudeRawProcessRepository.ts';
import { NativePilotNpmEnvironmentRepository } from '../../../src/repository/NativePilotNpmEnvironmentRepository.ts';
const environment = {
    HOME: join('/', 'home', 'node'),
    PATH: '/pilot/runtime-bin:/usr/local/bin:/usr/bin:/bin',
    LANG: 'C.UTF-8',
    HOSTNAME: 'measured-container',
    NODE_VERSION: '24.21.0',
    YARN_VERSION: '1.22.22',
    ...NativePilotNpmEnvironmentRepository.additions,
};
const validate = (value) =>
    NativeClaudeRawProcessRepository.validateEnvironment(value, 'measured-container', '24.21.0');

test('complete selected offline set preserves every inherited normal-account metadata byte', () => {
    const value = Object.freeze({ ...environment });
    const original = JSON.stringify(value);
    validate(value);
    assert.equal(JSON.stringify(value), original);
    assert.equal(value.HOME, join('/', 'home', 'node'));
    assert.equal(value.HOSTNAME, 'measured-container');
    assert.equal(value.NODE_VERSION, '24.21.0');
    assert.equal(value.YARN_VERSION, '1.22.22');
});

test('each missing or altered offline key and any unknown npm spelling is rejected', () => {
    for (const key of Object.keys(NativePilotNpmEnvironmentRepository.additions)) {
        const missing = { ...environment };
        delete missing[key];
        assert.throws(() => validate(missing), /raw_environment/);
        assert.throws(() => validate({ ...environment, [key]: 'changed' }), /raw_environment/);
    }
    for (const key of ['NPM_CONFIG_REGISTRY', 'npm_config_offline', 'npm_config_registry'])
        assert.throws(() => validate({ ...environment, [key]: 'true' }), /raw_environment/);
});

test('profile overrides, changed image metadata and arbitrary inherited additions remain rejected', () => {
    for (const [key, value] of [
        ['HOME', '/other'],
        ['CODEX_HOME', '/other'],
        ['HOSTNAME', 'different'],
        ['NODE_VERSION', '26.0.0'],
        ['YARN_VERSION', 'invalid'],
        ['UNSELECTED', 'value'],
    ])
        assert.throws(() => validate({ ...environment, [key]: value }), /raw_environment/);
});
