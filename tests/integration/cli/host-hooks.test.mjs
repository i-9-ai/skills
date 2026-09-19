// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
function cli(args, cwd, input) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 10000,
        input,
    });
}

test('host adapters emit documented context envelopes and configuration without enabling hosts', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-host-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const configurations = {};
    for (const host of ['codex', 'claude', 'copilot', 'gemini']) {
        const config = cli(['hook', 'session-config', '--host', host], root);
        assert.equal(config.status, 0, config.stderr);
        configurations[host] = JSON.parse(config.stdout);
        assert.deepEqual(readdirSync(root), []);
        const output = cli(
            ['hook', 'session-index', '--host', host, '--project', root, '--no-global'],
            root,
        );
        assert.equal(output.status, 0, output.stderr);
        const context =
            host === 'codex'
                ? output.stdout
                : host === 'copilot'
                  ? JSON.parse(output.stdout).additionalContext
                  : JSON.parse(output.stdout).hookSpecificOutput.additionalContext;
        assert.match(context, /No readable skill entrypoints/);
        assert.deepEqual(readdirSync(root), []);
    }
    assert.equal(configurations.copilot.version, 1);
    assert.equal(configurations.copilot.hooks.sessionStart[0].timeoutSec, 3);
    assert.match(configurations.copilot.hooks.sessionStart[0].bash, /--host copilot/);
    assert.equal(configurations.gemini.hooks.SessionStart[0].hooks[0].timeout, 3000);
    assert.equal(configurations.gemini.hooks.SessionStart[0].matcher, undefined);
    assert.equal(configurations.claude.hooks.SessionStart[0].hooks[0].timeout, 3);

    const filename = join(root, 'gemini.json');
    writeFileSync(filename, JSON.stringify(configurations.gemini));
    const result = cli(['hook', 'verify', '--host', 'gemini', '--file', filename], root);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { matches: true, executed: false });
    assert.equal(cli(['hook', 'verify', '--host', 'claude', '--file', filename], root).status, 1);
});

test('unsupported adapters fail rather than generating inert registration', () => {
    assert.notEqual(cli(['hook', 'session-config', '--host', 'opencode']).status, 0);
    assert.notEqual(cli(['hook', 'session-index', '--host', 'unknown', '--no-global']).status, 0);
    const inventory = JSON.parse(cli(['hook', 'list']).stdout);
    assert.match(inventory.find((entry) => entry.host === 'opencode').status, /unimplemented/);
    assert.match(
        inventory.find((entry) => entry.name === 'skill-read-metrics' && entry.host === 'other')
            .status,
        /unimplemented/,
    );
});

test('Antigravity and Hermes emit first-invocation context through distinct native contracts', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-extra-host-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const [host, first, later] of [
        ['antigravity', { invocationNum: 0 }, { invocationNum: 1 }],
        [
            'hermes',
            { hook_event_name: 'pre_llm_call', extra: { is_first_turn: true } },
            { hook_event_name: 'pre_llm_call', extra: { is_first_turn: false } },
        ],
    ]) {
        const args = ['hook', 'session-index', '--host', host, '--project', root, '--no-global'];
        const result = cli(args, root, JSON.stringify(first));
        assert.equal(result.status, 0, result.stderr);
        const output = JSON.parse(result.stdout);
        const context =
            host === 'antigravity' ? output.injectSteps[0].ephemeralMessage : output.context;
        assert.match(context, /No readable skill entrypoints/);
        assert.deepEqual(JSON.parse(cli(args, root, JSON.stringify(later)).stdout), {});
        const malformed = host === 'hermes' ? '{"hook_event_name":"pre_llm_call"}' : '{}';
        assert.notEqual(cli(args, root, malformed).status, 0);
        const config = JSON.parse(cli(['hook', 'session-config', '--host', host], root).stdout);
        if (host === 'antigravity')
            assert.equal(config['i9-available-skills'].PreInvocation[0].timeout, 3);
        if (host === 'hermes') assert.match(config.hooks.pre_llm_call[0].command, /^sh -c '/);
        assert.deepEqual(readdirSync(root), []);
    }
});
