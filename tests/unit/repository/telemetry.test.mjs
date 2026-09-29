import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { SkillReadRepository } from '../../../src/repository/SkillReadRepository.ts';
import { TelemetryInputRepository } from '../../../src/repository/TelemetryInputRepository.ts';
import { TelemetryLogRepository } from '../../../src/repository/TelemetryLogRepository.ts';

const event = (eventType, extra = {}) => ({
    schema_version: 1,
    event_type: eventType,
    event_id: randomUUID(),
    correlation_id: randomUUID(),
    occurred_at: '2026-09-19T00:00:00.000Z',
    source_host: 'manual',
    source_adapter: 'test',
    session: 'opaque-a',
    payload:
        eventType === 'session.started'
            ? {}
            : { collection: 'demo', skill: 'skill-authoring', revision: 'sha256:abc' },
    ...extra,
});
function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

test('typed retries, attempts and explicit session counts remain distinct', (t) => {
    const store = new SkillReadRepository(path.join(fixture(t), 'usage.db'));
    t.after(() => store.close());
    const attempt = event('skill.read.attempted');
    store.recordEvent(attempt);
    assert.equal(store.rank().rows.length, 0);
    store.recordEvent(event('session.started'));
    store.recordEvent(event('session.started')); // resume observation in the same opaque session
    const read = event('skill.read.observed', { correlation_id: attempt.correlation_id });
    assert.equal(store.recordEvent(read).recorded, true);
    assert.equal(store.recordEvent({ ...read, payload: { ...read.payload } }).recorded, false);
    assert.throws(
        () => store.recordEvent({ ...read, session: 'changed' }),
        (error) => error.code === 'evidence_conflict',
    );
    store.recordEvent(event('skill.read.observed', { session: 'opaque-b' }));
    assert.deepEqual(
        { ...store.trends().rows[0] },
        {
            period: '2026-09-19',
            reads: 2,
            read_sessions: 2,
            attempts: 1,
            session_starts: 2,
            started_sessions: 1,
        },
    );
    assert.equal(store.trends({ until: '2026-09-19T00:00:00.000Z' }).rows.length, 0);
    const legacy = {
        event_id: attempt.event_id,
        ...attempt.payload,
        session: attempt.session,
        occurred_at: attempt.occurred_at,
    };
    assert.throws(
        () => store.record(legacy),
        (error) => error.code === 'evidence_conflict',
    );
});

test('existing v1 observations survive additive migration without fabricated session starts', (t) => {
    const filename = path.join(fixture(t), 'usage.db');
    let store = new SkillReadRepository(filename);
    store.record({
        event_id: 'legacy',
        collection: 'demo',
        skill: 'skill-authoring',
        revision: 'old',
        session: 'legacy-session',
        occurred_at: '2026-09-18T23:59:59.999Z',
    });
    store.close();
    const db = new DatabaseSync(filename);
    db.exec(
        'DROP TABLE catalog_changes; DROP TABLE catalog_members; DROP TABLE catalog_observations; DROP TABLE lifecycle_events; DROP TABLE usage_events; DELETE FROM usage_migrations WHERE version>=2',
    );
    const original = db
        .prepare('SELECT checksum FROM usage_migrations WHERE version=1')
        .get().checksum;
    db.close();
    const bytes = fs.readFileSync(filename);
    assert.throws(() => new SkillReadRepository(filename, { readOnly: true }), /schema upgrade/);
    assert.deepEqual(fs.readFileSync(filename), bytes);
    store = new SkillReadRepository(filename);
    assert.equal(store.rank().rows[0].reads, 1);
    assert.equal(store.trends().rows[0].session_starts, 0);
    store.close();
    const after = new DatabaseSync(filename, { readOnly: true });
    assert.equal(
        after.prepare('SELECT checksum FROM usage_migrations WHERE version=1').get().checksum,
        original,
    );
    assert.equal(after.prepare('SELECT COUNT(*) AS count FROM usage_events').get().count, 0);
    after.close();
});

test('queries never create storage and trends report bounded output', (t) => {
    const filename = path.join(fixture(t), 'usage.db');
    assert.throws(() => new SkillReadRepository(filename, { readOnly: true }));
    assert.equal(fs.existsSync(filename), false);
    const store = new SkillReadRepository(filename);
    store.recordEvent(event('skill.read.observed'));
    store.recordEvent(event('skill.read.observed', { occurred_at: '2026-09-18T23:59:59.999Z' }));
    store.recordEvent(event('session.started', { occurred_at: '2026-08-18T00:00:00.000Z' }));
    assert.equal(store.trends({ limit: 1 }).truncated, true);
    assert.equal(store.trends({ interval: 'month' }).rows.length, 2);
    assert.throws(() => store.trends({ interval: 'year' }));
    assert.throws(() => store.trends({ limit: 367 }));
    store.close();
    const bytes = fs.readFileSync(filename);
    const reader = new SkillReadRepository(filename, { readOnly: true });
    reader.rank();
    reader.trends();
    reader.close();
    assert.deepEqual(fs.readFileSync(filename), bytes);
});

test('event input rejects duplicate keys, links, hardlinks and oversized stdin', async (t) => {
    const root = fixture(t);
    const reader = new TelemetryInputRepository();
    const file = path.join(root, 'event.json');
    const item = event('session.started');
    fs.writeFileSync(file, JSON.stringify(item));
    assert.deepEqual(await reader.read(file), item);
    assert.deepEqual(await reader.read('-', Readable.from([JSON.stringify(item)])), item);
    await assert.rejects(() => reader.read('-', Readable.from(['{"a":1,"a":2}'])));
    await assert.rejects(() => reader.read('-', Readable.from(['x'.repeat(8193)])), /size limit/);
    fs.symlinkSync(file, path.join(root, 'linked'));
    await assert.rejects(() => reader.read(path.join(root, 'linked')));
    fs.linkSync(file, path.join(root, 'hardlink'));
    await assert.rejects(() => reader.read(file), /non-linked/);
});

test('diagnostics rotate within fixed bounds and reject linked rotation paths', (t) => {
    const root = fixture(t);
    const file = path.join(root, 'diagnostics.jsonl');
    const log = new TelemetryLogRepository(file, 256, 2);
    const record = {
        timestamp: '2026-09-19T00:00:00.000Z',
        level: 'info',
        component: 'skill-telemetry',
        category: 'recorded',
        prompt: 'must not persist',
    };
    for (let i = 0; i < 10; i++) log.append(record);
    const files = fs.readdirSync(root);
    assert.equal(files.length, 3);
    for (const name of files) {
        const text = fs.readFileSync(path.join(root, name), 'utf8');
        assert.ok(Buffer.byteLength(text) <= 256);
        assert.ok(!text.includes('prompt') && !text.includes('must not persist'));
    }
    fs.unlinkSync(file + '.2');
    const outside = path.join(root, 'outside');
    fs.writeFileSync(outside, 'sentinel');
    fs.symlinkSync(outside, file + '.2');
    const before = fs.readFileSync(file);
    assert.throws(() => log.append(record), /non-linked/);
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'sentinel');
});
