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

test('read retries, conflicts, distinct sessions and period', (t) => {
    const store = new SkillReadRepository(fixture(t));
    t.after(() => store.close());
    assert.equal(store.record(event('a')).recorded, true);
    assert.equal(store.record(event('a')).recorded, false);
    assert.throws(() => store.record({ ...event('a'), session: 'b' }));
    store.record({ ...event('b'), session: 'session-b' });
    assert.deepEqual(
        { ...store.rank().rows[0] },
        { collection: 'demo', skill: 'console', reads: 2, sessions: 2 },
    );
    assert.equal(store.rank({ until: '2026-09-15T12:00:00.000Z' }).rows.length, 0);
    assert.throws(() => store.record({ ...event('c'), prompt: 'do not store' }));
    assert.throws(() => store.rank({ limit: 101 }));
});
