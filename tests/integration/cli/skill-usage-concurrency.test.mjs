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

test('independent processes preserve concurrent event inserts', async (t) => {
    const db = fixture(t);
    const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize' };
    await Promise.all(
        Array.from(
            { length: 6 },
            (_, i) =>
                new Promise((resolve, reject) => {
                    const child = spawn(process.execPath, [server, 'mcp', 'usage', '--db', db], {
                        stdio: ['pipe', 'ignore', 'pipe'],
                    });
                    let errors = '';
                    child.stderr.on('data', (x) => (errors += x));
                    child.on('error', reject);
                    child.on('exit', (code) =>
                        code === 0 ? resolve() : reject(new Error(errors)),
                    );
                    child.stdin.end(
                        [
                            initialize,
                            { jsonrpc: '2.0', method: 'notifications/initialized' },
                            {
                                jsonrpc: '2.0',
                                id: 2,
                                method: 'tools/call',
                                params: {
                                    name: 'skill_read_record',
                                    arguments: event(`event-${i}`),
                                },
                            },
                        ]
                            .map(JSON.stringify)
                            .join('\n') + '\n',
                    );
                }),
        ),
    );
    const store = new SkillReadRepository(db);
    assert.equal(store.rank().rows[0].reads, 6);
    store.close();
});
