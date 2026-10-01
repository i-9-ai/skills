// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
    catalogFixture,
    repository,
    snapshot,
} from '../../unit/fixture/InstalledCatalogFixture.mjs';

const observedRead = {
    event_id: 'codex-mapping-synthetic-read',
    collection: 'i9-skills',
    skill: 'alpha-guide',
    revision: 'sha256:synthetic',
    session: 'codex-mapping-synthetic-session',
    occurred_at: '2026-09-29T12:00:00.000Z',
};

function invoke(target, operations, hostEnvironment = {}) {
    const manifest = JSON.parse(
        fs.readFileSync(join(repository, '.codex-plugin/plugin.json'), 'utf8'),
    );
    const mapping = JSON.parse(fs.readFileSync(join(repository, manifest.mcpServers), 'utf8'));
    const server = mapping.mcpServers['i9-skills'];
    const forwarded = Object.fromEntries(
        server.env_vars
            .filter((name) => hostEnvironment[name] !== undefined)
            .map((name) => [name, hostEnvironment[name]]),
    );
    const messages = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        ...operations.map(([name, args = {}], index) => ({
            jsonrpc: '2.0',
            id: index + 2,
            method: 'tools/call',
            params: { name, arguments: args },
        })),
    ];
    // This fixture exercises the resolved legacy mapping without a host install.
    // Native loading and environment forwarding are separate pilot evidence.
    const result = spawnSync(server.command, server.args, {
        cwd: resolve(target.installed, server.cwd),
        env: { ...target.environment, ...forwarded },
        input: messages.map((message) => JSON.stringify(message)).join('\n') + '\n',
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, operations.length + 1);
    assert.equal(rows[0].result.serverInfo.name, 'i9-skills');
    return rows.slice(1).map((row) => row.result);
}

function unavailable(result) {
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'storage_unavailable');
}

test('Codex mapping reads the installed catalog with spaces and queries never initialize shared state', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const before = snapshot(target.root);
    const [search, rankings] = invoke(
        target,
        [['skill_catalog_search', { query: 'alpha-guide' }], ['skill_read_rankings']],
        { CLAUDE_PLUGIN_DATA: target.data, PLUGIN_ROOT: target.caller },
    );
    assert.equal(search.isError, undefined);
    assert.deepEqual(
        search.structuredContent.skills.map((skill) => skill.name),
        ['alpha-guide'],
    );
    unavailable(rankings);
    assert.equal(fs.existsSync(target.data), false);
    assert.deepEqual(snapshot(target.root), before);
});

test('Codex mapping writes only to explicitly forwarded external data and preserves idempotence', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const protectedBefore = [target.installed, target.caller, target.home].map(snapshot);
    const [first, repeated, rankings] = invoke(
        target,
        [
            ['skill_read_record', observedRead],
            ['skill_read_record', observedRead],
            ['skill_read_rankings'],
        ],
        { I9_SKILLS_USAGE_DB: join(target.data, 'skill-usage.db'), PLUGIN_DATA: target.installed },
    );
    assert.equal(first.isError, undefined);
    assert.equal(first.structuredContent.recorded, true);
    assert.equal(repeated.structuredContent.recorded, false);
    assert.equal(rankings.structuredContent.rows[0].reads, 1);
    assert.equal(rankings.structuredContent.rows[0].sessions, 1);
    assert.deepEqual(fs.readdirSync(target.data), ['skill-usage.db']);
    const beforeQuery = snapshot(target.data);
    const [later] = invoke(target, [['skill_read_rankings']], {
        I9_SKILLS_USAGE_DB: join(target.data, 'skill-usage.db'),
    });
    assert.equal(later.structuredContent.rows[0].reads, 1);
    assert.deepEqual(snapshot(target.data), beforeQuery);
    assert.deepEqual([target.installed, target.caller, target.home].map(snapshot), protectedBefore);
});

for (const location of ['installed', 'relative', 'linked']) {
    test(`Codex mapping rejects ${location} data without losing catalog access`, (t) => {
        const target = catalogFixture(t, { runtime: true });
        let data = join(target.installed, 'forbidden-state');
        if (location === 'relative') data = 'relative-state';
        if (location === 'linked') {
            const destination = join(target.root, 'external-state');
            fs.mkdirSync(destination);
            data = join(target.root, 'linked-state');
            fs.symlinkSync(destination, data, 'dir');
        }
        const before = snapshot(target.root);
        const [write, search] = invoke(
            target,
            [['skill_read_record', observedRead], ['skill_catalog_search']],
            { I9_SKILLS_USAGE_DB: location === 'relative' ? data : join(data, 'skill-usage.db') },
        );
        unavailable(write);
        assert.equal(search.structuredContent.total, 5);
        assert.deepEqual(snapshot(target.root), before);
    });
}
