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

test('reject catalog and altered migrations without reset', (t) => {
    const filename = fixture(t);
    let db = new DatabaseSync(filename);
    db.exec("CREATE TABLE metadata(k TEXT); INSERT INTO metadata VALUES ('sentinel')");
    db.close();
    assert.throws(() => new SkillReadRepository(filename));
    db = new DatabaseSync(filename);
    assert.equal(db.prepare('SELECT k FROM metadata').get().k, 'sentinel');
    db.close();
    fs.unlinkSync(filename);
    const store = new SkillReadRepository(filename);
    store.close();
    db = new DatabaseSync(filename);
    db.exec("UPDATE usage_migrations SET checksum='altered'");
    db.close();
    assert.throws(() => new SkillReadRepository(filename));
});
