// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    catalogFixture,
    repository,
    snapshot,
} from '../../unit/fixture/InstalledCatalogFixture.mjs';

const launcher = join(repository, 'bin/index.mjs');
const event = {
    event_id: 'synthetic-cli-read',
    collection: 'demo',
    skill: 'console',
    revision: 'sha256:abc',
    session: 'session-a',
    occurred_at: '2026-09-15T12:00:00.000Z',
};

function cli(target, args, input) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd: target.caller,
        env: target.environment,
        input,
        encoding: 'utf8',
        timeout: 10000,
    });
}

function requests(calls) {
    return (
        [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            ...calls.map((call, index) => ({ jsonrpc: '2.0', id: index + 2, ...call })),
        ]
            .map((message) => JSON.stringify(message))
            .join('\n') + '\n'
    );
}

function call(name, args = {}) {
    return { method: 'tools/call', params: { name, arguments: args } };
}

test('the unified CLI MCP supports explicit read recording and rankings with bounded errors', (t) => {
    const target = catalogFixture(t);
    const db = join(target.root, 'usage.db');
    const result = cli(
        target,
        ['mcp', 'serve', '--db', db],
        requests([
            { method: 'tools/list' },
            call('skill_read_record', event),
            call('skill_read_rankings'),
            call('skill_read_record', { prompt: 'private-sentinel' }),
        ]),
    );
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 5);
    assert.equal(rows[1].result.tools.length, 11);
    assert.equal(rows[2].result.structuredContent.recorded, true);
    assert.equal(rows[3].result.structuredContent.rows[0].reads, 1);
    assert.equal(rows[4].result.structuredContent.error.code, 'invalid_input');
    assert.equal(result.stdout.includes('private-sentinel'), false);
});

test('CLI MCP initialization, catalog calls and invalid recording do not create an explicit database', (t) => {
    const target = catalogFixture(t);
    const before = snapshot(target.root);
    const db = join(target.root, 'usage.db');
    const result = cli(
        target,
        ['mcp', 'serve', '--db', db],
        requests([
            { method: 'tools/list' },
            call('skill_catalog_search', { query: 'skill-authoring', limit: 1 }),
            call('skill_read_record', {}),
            call('skill_read_rankings'),
        ]),
    );
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout.trim().split('\n').map(JSON.parse);
    assert.deepEqual(
        rows[2].result.structuredContent.skills.map((skill) => skill.name),
        ['skill-authoring'],
    );
    assert.equal(rows[3].result.structuredContent.error.code, 'invalid_input');
    assert.equal(rows[4].result.structuredContent.error.code, 'storage_unavailable');
    assert.equal(fs.existsSync(db), false);
    assert.deepEqual(snapshot(target.root), before);
});

test('catalog CLI queries use the installed collection despite caller and HOME decoys', (t) => {
    const target = catalogFixture(t);
    const before = snapshot(target.root);
    const run = (args) => {
        const result = cli(target, ['catalog', ...args]);
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
    };
    const search = run(['search', '--query', 'skill-authoring', '--limit', '1']);
    assert.deepEqual(
        search.skills.map((skill) => skill.name),
        ['skill-authoring'],
    );
    assert.equal(
        search.provenance.package_version,
        JSON.parse(fs.readFileSync(join(repository, 'package.json'), 'utf8')).version,
    );
    assert.equal(run(['search', '--query', 'decoy-guide']).total, 0);
    const resource = run(['read', '--skill', 'skill-authoring']);
    assert.equal(
        resource.content,
        fs.readFileSync(join(repository, '.agents/skills/skill-authoring/SKILL.md'), 'utf8'),
    );
    const overview = run(['overview', '--max-entries', '1']);
    assert.ok(overview.overview.length <= 4096);
    assert.match(overview.overview, /additional packages omitted/u);
    for (const args of [
        ['search', '--limit', '51'],
        ['read', '--skill', 'skill-authoring', '--resource', '../package.json'],
        ['search', '--collection', target.installed],
    ]) {
        const result = cli(target, ['catalog', ...args]);
        assert.notEqual(result.status, 0, result.stdout);
    }
    assert.notEqual(
        cli(target, ['mcp', 'usage', '--help']).status,
        0,
        'the obsolete usage-only route is not retained',
    );
    assert.deepEqual(snapshot(target.root), before);
});
