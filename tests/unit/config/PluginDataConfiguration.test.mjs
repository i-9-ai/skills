// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginDataConfiguration } from '../../../src/config/PluginDataConfiguration.ts';
import { AgentStateConfiguration } from '../../../src/config/AgentStateConfiguration.ts';

test('shared state names canonical paths without consulting native plugin data', () => {
    const environment = {
        HOME: '/data/agent',
        PLUGIN_DATA: '/plugin data',
        CLAUDE_PLUGIN_DATA: '/claude-data',
    };
    const state = new AgentStateConfiguration(environment);
    assert.equal(state.skills(), '/data/agent/.agents/skills');
    assert.equal(state.catalog(), '/data/agent/.agents/skills-catalog.json');
    assert.equal(
        new PluginDataConfiguration(environment).usageDatabase(),
        '/data/agent/.agents/skills-usage.db',
    );
});

test('explicit usage database wins over state root and preserves a legacy filename', () => {
    const environment = {
        HOME: '/data/agent',
        I9_AGENT_STATE_ROOT: '/selected/state',
        I9_SKILLS_USAGE_DB: '/legacy/plugin/skill-usage.db',
    };
    assert.equal(
        new PluginDataConfiguration(environment).usageDatabase('codex'),
        environment.I9_SKILLS_USAGE_DB,
    );
    assert.equal(
        new PluginDataConfiguration({
            ...environment,
            I9_SKILLS_USAGE_DB: undefined,
        }).usageDatabase(),
        '/selected/state/skills-usage.db',
    );
    assert.equal(
        new PluginDataConfiguration({
            ...environment,
            I9_AGENT_STATE_ROOT: 'invalid-ignored-root',
        }).usageDatabase(),
        environment.I9_SKILLS_USAGE_DB,
    );
});

test('explicit state and database selections reject unsafe paths', () => {
    for (const value of [
        '',
        './relative',
        '/control\nline',
        '/bad\0path',
        '/' + 'a'.repeat(4096),
    ]) {
        assert.throws(
            () => new AgentStateConfiguration({ I9_AGENT_STATE_ROOT: value }),
            /absolute/,
        );
        assert.throws(
            () => new PluginDataConfiguration({ I9_SKILLS_USAGE_DB: value }).usageDatabase(),
            /absolute/,
        );
    }
});
