import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SkillReadRepository } from '../../../src/repository/SkillReadRepository.ts';
const server = path.resolve('bin/index.mjs');
const event = (id) => ({
    event_id: id,
    collection: 'demo',
    skill: 'console',
    revision: 'sha256:abc',
    session: 'session-a',
    occurred_at: '2026-09-15T12:00:00.000Z',
});
function fixture(t) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-')));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return path.join(dir, 'usage.db');
}

test('stdio initialization and bounded tool errors', (t) => {
    const db = fixture(t);
    const messages = [
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'test', version: '1' },
            },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'skill_read_record', arguments: event('a') },
        },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'skill_read_rankings' } },
        {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'skill_read_record', arguments: { prompt: 'private-sentinel' } },
        },
    ];
    const result = spawnSync(process.execPath, [server, 'mcp', 'usage', '--db', db], {
        input: messages.map((x) => JSON.stringify(x)).join('\n') + '\n',
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 5);
    assert.equal(rows[1].result.tools.length, 2);
    assert.equal(rows[3].result.structuredContent.rows[0].reads, 1);
    assert.equal(rows[4].result.isError, true);
    assert.ok(!result.stdout.includes('private-sentinel'));
});
