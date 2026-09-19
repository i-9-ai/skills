// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
function cli(args, cwd) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 10000,
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
        inventory.find((entry) => entry.name === 'skill-read-metrics').status,
        /unimplemented/,
    );
});
