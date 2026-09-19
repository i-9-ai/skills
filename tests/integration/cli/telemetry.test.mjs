import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('telemetry CLI records stdin explicitly and reports read-only trends with log limits', (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-cli-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const db = path.join(root, 'usage.db');
    const log = path.join(root, 'diagnostics.jsonl');
    const run = (args, input) =>
        spawnSync(process.execPath, ['bin/index.mjs', 'telemetry', ...args], {
            encoding: 'utf8',
            input,
        });
    const event = {
        schema_version: 1,
        event_type: 'skill.read.observed',
        event_id: randomUUID(),
        correlation_id: randomUUID(),
        occurred_at: '2026-09-19T00:00:00.000Z',
        source_host: 'manual',
        source_adapter: 'cli',
        session: 'opaque',
        payload: { collection: 'demo', skill: 'skill-authoring', revision: 'unknown' },
    };
    let result = run(
        ['record', '--db', db, '--file', '-', '--log-file', log],
        JSON.stringify(event),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).recorded, true);
    result = run(['record', '--db', db, '--file', '-'], JSON.stringify(event));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).recorded, false);
    const before = fs.readFileSync(db);
    result = run(['trends', '--db', db]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rows[0].reads, 1);
    result = run(['rankings', '--db', db]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rows[0].reads, 1);
    assert.deepEqual(fs.readFileSync(db), before);
    result = run(
        ['record', '--db', db, '--file', '-'],
        JSON.stringify({ ...event, prompt: 'private' }),
    );
    assert.notEqual(result.status, 0);
    assert.ok(!result.stderr.includes('private'));
    assert.deepEqual(fs.readFileSync(db), before);
    result = run(
        ['record', '--db', db, '--file', '-', '--log-file', path.join(root, 'missing', 'log')],
        JSON.stringify({ ...event, event_id: randomUUID() }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).log, 'unavailable');
});
