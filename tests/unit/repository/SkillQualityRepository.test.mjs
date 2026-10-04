// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { SkillEvidenceDatabaseRepository } from '../../../src/repository/SkillEvidenceDatabaseRepository.ts';
import { SkillQualityRepository } from '../../../src/repository/SkillQualityRepository.ts';
import { SkillEvidenceContractValidator } from '../../../src/validator/SkillEvidenceContractValidator.ts';
import { SkillQualityValidator } from '../../../src/validator/SkillQualityValidator.ts';
import { assertion, fixture, query, reversed } from '../fixture/SkillQualityFixture.mjs';

function writer(t) {
    const target = fixture(t);
    const connection = new SkillEvidenceDatabaseRepository(target.database);
    t.after(() => connection.close());
    return { ...target, connection, repository: new SkillQualityRepository(connection) };
}

test('canonical retries, conflicting metadata and cross-family occurrence IDs are immutable', (t) => {
    const target = writer(t);
    const event = assertion();
    assert.equal(target.repository.record(event).recorded, true);
    assert.equal(target.repository.record(reversed(event)).recorded, false);
    const changed = structuredClone(event);
    changed.payload.method.version = '0.2.0';
    assert.throws(
        () => target.repository.record(changed),
        (error) => error.code === 'evidence_conflict',
    );
    for (const family of ['read', 'lifecycle', 'catalog']) {
        const value = assertion();
        if (family === 'read')
            target.connection.database
                .prepare('INSERT INTO usage_reads VALUES(?,?,?,?,?,?)')
                .run(
                    value.event_id,
                    'demo',
                    'example-skill',
                    'unknown',
                    'opaque',
                    value.occurred_at,
                );
        else
            target.connection.database
                .prepare('INSERT INTO usage_events VALUES(?,?,?,?,?)')
                .run(
                    value.event_id,
                    family === 'lifecycle' ? 'skill.activated' : 'catalog.observed',
                    value.occurred_at,
                    '',
                    '{}',
                );
        assert.throws(
            () => target.repository.record(value),
            (error) => error.code === 'evidence_conflict',
        );
    }
    assert.equal(
        target.connection.database.prepare('SELECT COUNT(*) AS n FROM quality_receipts').get().n,
        1,
    );
    assert.throws(
        () =>
            target.repository.record({
                ...event,
                payload: { ...event.payload, assurance: 'locally_observed_official_process' },
            }),
        (error) => error.code === 'invalid_input',
    );
});

test('same-name sources/revisions stay distinct, independent observations and negative receipts remain', (t) => {
    const target = writer(t);
    const first = assertion();
    const second = assertion();
    second.payload.source.repository = 'https://another.example.org/skills';
    const third = assertion();
    third.payload.source.package_sha256 = 'd'.repeat(64);
    const failed = assertion();
    failed.payload.result = 'fail';
    Object.assign(failed.payload.coverage, { passed: 0, failed: 1 });
    for (const value of [first, second, third, failed, assertion()])
        target.repository.record(value);
    assert.equal(target.repository.inspect(query).matching_receipts, 5);
    assert.equal(
        target.repository.inspect({
            ...query,
            source_key: SkillEvidenceContractValidator.sourceKey(first.payload.source),
        }).matching_receipts,
        4,
    );
    const exact = target.repository.inspect({
        ...query,
        identity_key: SkillEvidenceContractValidator.identityKey(first.payload.source),
    });
    assert.equal(exact.matching_receipts, 3);
    assert.equal(exact.rows.filter((row) => row.receipt.payload.result === 'fail').length, 1);
    assert.ok(exact.rows.every((row) => row.receipt.payload.assurance === 'caller_assertion'));
});

test('paging is deterministic and cursor scope cannot drift; inspection is byte-preserving', (t) => {
    const target = writer(t);
    for (let index = 0; index < 3; index += 1) target.repository.record(assertion());
    target.connection.close();
    const before = fs.readFileSync(target.database);
    const connection = new SkillEvidenceDatabaseRepository(target.database, { readOnly: true });
    const repository = new SkillQualityRepository(connection);
    const first = repository.inspect({ ...query, limit: 1 });
    const second = repository.inspect({ ...query, limit: 1, after: first.next_cursor });
    const third = repository.inspect({ ...query, limit: 1, after: second.next_cursor });
    assert.equal(third.next_cursor, null);
    assert.deepEqual(
        [first, second, third].flatMap((page) => page.rows.map((row) => row.receipt.event_id)),
        repository.inspect(query).rows.map((row) => row.receipt.event_id),
    );
    assert.throws(
        () => repository.inspect({ ...query, collection: 'other', after: first.next_cursor }),
        (error) => error.code === 'invalid_input',
    );
    connection.close();
    assert.deepEqual(fs.readFileSync(target.database), before);
    assert.deepEqual(fs.readdirSync(target.root), ['evidence.db']);
});

test('period work is bounded before cursor/display and output limit rejects oversized pages', (t) => {
    const target = writer(t);
    const value = new SkillQualityValidator().assertion(assertion());
    const envelope = JSON.stringify(value);
    const insert = target.connection.database.prepare(
        'INSERT INTO quality_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    const insertEvent = target.connection.database.prepare(
        'INSERT INTO usage_events VALUES(?,?,?,?,?)',
    );
    target.connection.transaction(() => {
        for (let index = 0; index < 5001; index += 1) {
            const eventId = randomUUID();
            insertEvent.run(
                eventId,
                value.event_type,
                value.occurred_at,
                '',
                JSON.stringify({ ...value, event_id: eventId }),
            );
            insert.run(
                eventId,
                value.correlation_id,
                'demo',
                'example-skill',
                SkillEvidenceContractValidator.sourceKey(value.payload.source),
                SkillEvidenceContractValidator.identityKey(value.payload.source),
                JSON.stringify(value.payload.source),
                value.occurred_at,
                value.occurred_at,
                value.payload.kind,
                value.payload.assurance,
                value.payload.method.name,
                value.payload.result,
            );
        }
    });
    assert.throws(
        () => target.repository.inspect({ ...query, limit: 1 }),
        (error) => error.code === 'query_limit_exceeded',
    );
    target.connection.database.exec('DELETE FROM quality_receipts');
    for (let index = 0; index < 100; index += 1) target.repository.record(assertion());
    assert.throws(
        () => target.repository.inspect({ ...query, limit: 100 }),
        (error) => error.code === 'response_too_large',
    );
    assert.equal(target.repository.inspect({ ...query, limit: 1 }).rows.length, 1);
    assert.ok(envelope.length > 0);
});

test('changed stored projection and oversized envelopes fail without raw data exposure', (t) => {
    const target = writer(t);
    const event = assertion();
    target.repository.record(event);
    target.connection.database
        .prepare("UPDATE quality_receipts SET result='fail' WHERE event_id=?")
        .run(event.event_id);
    assert.throws(
        () => target.repository.inspect(query),
        (error) => error.code === 'storage_unavailable' && !error.message.includes('observations'),
    );
    assert.throws(
        () => target.repository.record(event),
        (error) => error.code === 'storage_unavailable',
    );
    target.connection.database
        .prepare('UPDATE usage_events SET envelope=? WHERE event_id=?')
        .run('x'.repeat(20_000), event.event_id);
    assert.throws(
        () => target.repository.inspect(query),
        (error) => error.code === 'storage_unavailable',
    );
});
