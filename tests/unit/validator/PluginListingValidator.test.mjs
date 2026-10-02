// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PluginListingValidator } from '../../../src/validator/PluginListingValidator.ts';

const listing = () =>
    JSON.parse(readFileSync(new URL('../../../.codex-plugin/plugin.json', import.meta.url)))
        .interface;
const validator = new PluginListingValidator();

test('canonical listing has a complete bounded subtitle, HTTPS policy URLs and a real square icon', () => {
    const value = listing();
    assert.doesNotThrow(() => validator.validate(value));
    assert.equal([...value.shortDescription].length, 26);
    assert.equal(value.privacyPolicyURL, 'https://skills.i-9.ai/privacy/');
    const png = readFileSync(new URL('../../../assets/plugin-icon.png', import.meta.url));
    assert.doesNotThrow(() => validator.validateIcon(png));
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
});

test('overlong subtitle, missing policies, hidden extensions and unsupported capabilities fail before staging', () => {
    const mutations = [
        (value) => {
            value.shortDescription = 'x'.repeat(31);
        },
        (value) => {
            delete value.privacyPolicyURL;
        },
        (value) => {
            value.apps = './.app.json';
        },
        (value) => {
            value.capabilities.push('MCP');
        },
        (value) => {
            value.defaultPrompt = ['repeat', ' repeat '];
        },
        (value) => {
            value.logo = '../other.png';
        },
    ];
    for (const mutate of mutations) {
        const value = listing();
        mutate(value);
        assert.throws(() => validator.validate(value));
    }
});

test('policy URLs cannot carry credentials, fragments or non-HTTPS destinations', () => {
    const authenticated = new URL('https://example.test/');
    authenticated.username = 'synthetic';
    authenticated.password = 'fixture-only';
    for (const url of [
        'http://example.test/privacy',
        authenticated.href,
        'https://example.test/#fragment',
        'not-a-url',
        'https://example.test/ space',
    ]) {
        const value = listing();
        value.privacyPolicyURL = url;
        assert.throws(() => validator.validate(value));
    }
});

test('icon type, actual dimensions and full PNG corruption are rejected', () => {
    const corrupt = readFileSync(new URL('../../../assets/plugin-icon.png', import.meta.url));
    corrupt[40] ^= 0xff;
    const small = readFileSync(
        new URL('../../../.agents/skills/skill-design/assets/icon.png', import.meta.url),
    );
    for (const bytes of [Buffer.from('not png'), corrupt, small]) {
        assert.throws(() => validator.validateIcon(bytes));
    }
});
