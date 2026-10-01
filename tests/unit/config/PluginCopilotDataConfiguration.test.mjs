// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginDataConfiguration } from '../../../src/config/PluginDataConfiguration.ts';

test('every supported host selects the shared database despite native DATA variables', () => {
    const configuration = new PluginDataConfiguration({
        HOME: '/data/agent',
        PLUGIN_DATA: '/codex-data',
        CLAUDE_PLUGIN_DATA: '/claude-data',
        COPILOT_PLUGIN_DATA: '/copilot data',
    });
    for (const host of [undefined, 'codex', 'claude', 'copilot', 'gemini']) {
        assert.equal(configuration.usageDatabase(host), '/data/agent/.agents/skills-usage.db');
    }
});

test('invalid automatically supplied DATA values cannot override the shared default', () => {
    for (const value of [undefined, '', '${COPILOT_PLUGIN_DATA}', './relative', '/bad\0data']) {
        const configuration = new PluginDataConfiguration({
            HOME: '/data/agent',
            PLUGIN_DATA: '/codex-data',
            CLAUDE_PLUGIN_DATA: '/claude-data',
            COPILOT_PLUGIN_DATA: value,
        });
        assert.equal(configuration.usageDatabase('copilot'), '/data/agent/.agents/skills-usage.db');
    }
});

test('host selectors remain explicit and unknown selectors are rejected', () => {
    const configuration = new PluginDataConfiguration({
        HOME: '/data/agent',
        COPILOT_PLUGIN_DATA: '/copilot-data',
    });
    assert.throws(() => configuration.usageDatabase('copilot-preview'), /Unsupported/);
});
