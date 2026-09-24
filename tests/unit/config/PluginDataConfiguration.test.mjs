// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginDataConfiguration } from '../../../src/config/PluginDataConfiguration.ts';

test('plugin data uses the host-owned persistent directory', () => {
    assert.equal(
        new PluginDataConfiguration({ PLUGIN_DATA: '/plugin data' }).usageDatabase(),
        '/plugin data/skill-usage.db',
    );
    assert.equal(
        new PluginDataConfiguration({ CLAUDE_PLUGIN_DATA: '/claude-data' }).usageDatabase(),
        '/claude-data/skill-usage.db',
    );
    assert.equal(
        new PluginDataConfiguration({ COPILOT_PLUGIN_DATA: '/copilot-data' }).usageDatabase(),
        '/copilot-data/skill-usage.db',
    );
});

test('plugin data refuses missing and relative locations', () => {
    for (const environment of [{}, { PLUGIN_DATA: '' }, { PLUGIN_DATA: './relative' }]) {
        assert.throws(() => new PluginDataConfiguration(environment).usageDatabase(), /absolute/);
    }
});
