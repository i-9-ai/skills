// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginDataConfiguration } from '../../../src/config/PluginDataConfiguration.ts';

test('Copilot selects only its explicitly supplied data directory', () => {
    const configuration = new PluginDataConfiguration({
        PLUGIN_DATA: '/codex-data',
        CLAUDE_PLUGIN_DATA: '/claude-data',
        COPILOT_PLUGIN_DATA: '/copilot data',
    });
    assert.equal(configuration.usageDatabase('copilot'), '/copilot data/skill-usage.db');
    assert.equal(configuration.usageDatabase('codex'), '/codex-data/skill-usage.db');
    assert.equal(configuration.usageDatabase('claude'), '/claude-data/skill-usage.db');
    assert.equal(configuration.usageDatabase(), '/codex-data/skill-usage.db');
});

test('Copilot missing, unresolved and invalid data cannot fall back to another host', () => {
    for (const value of [undefined, '', '${COPILOT_PLUGIN_DATA}', './relative', '/bad\0data']) {
        const configuration = new PluginDataConfiguration({
            PLUGIN_DATA: '/codex-data',
            CLAUDE_PLUGIN_DATA: '/claude-data',
            COPILOT_PLUGIN_DATA: value,
        });
        assert.throws(() => configuration.usageDatabase('copilot'), /absolute/);
    }
});

test('Copilot does not extend automatic host selection or permit unknown selectors', () => {
    const configuration = new PluginDataConfiguration({ COPILOT_PLUGIN_DATA: '/copilot-data' });
    assert.throws(() => configuration.usageDatabase(), /absolute/);
    assert.throws(() => configuration.usageDatabase('copilot-preview'), /Unsupported/);
});
