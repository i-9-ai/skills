// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

test('a clean plugin copy starts the observed-read MCP in host data', (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'i9-plugin-mcp-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const plugin = join(root, 'plugin');
    const data = join(root, 'plugin data');
    fs.mkdirSync(plugin);
    fs.mkdirSync(data);
    fs.cpSync(join(repository, 'src'), join(plugin, 'src'), { recursive: true });
    const contracts = '.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
    fs.cpSync(join(repository, contracts), join(plugin, contracts));
    fs.writeFileSync(join(plugin, 'package.json'), '{"type":"module"}\n');

    const entry = join(plugin, 'src/transport/PluginUsageMcpServer.ts');
    const result = spawnSync(process.execPath, [entry], {
        cwd: root,
        env: { PATH: process.env.PATH, PLUGIN_DATA: data },
        input:
            [
                { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
                { jsonrpc: '2.0', method: 'notifications/initialized' },
                { jsonrpc: '2.0', id: 2, method: 'tools/list' },
            ]
                .map((message) => JSON.stringify(message))
                .join('\n') + '\n',
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(responses[1].result.tools.length, 2);
    assert.equal(fs.existsSync(join(data, 'skill-usage.db')), true);
    assert.equal(fs.existsSync(join(plugin, 'skill-usage.db')), false);

    const missingData = spawnSync(process.execPath, [entry], {
        cwd: root,
        env: { PATH: process.env.PATH },
        encoding: 'utf8',
    });
    assert.notEqual(missingData.status, 0);
    assert.match(missingData.stderr, /plugin data directory is required/);
    assert.equal(missingData.stdout, '');
});
