// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { SkillReadRepository } from '../../../src/repository/SkillReadRepository.ts';
import { SkillEvidenceDatabaseRepository } from '../../../src/repository/SkillEvidenceDatabaseRepository.ts';
import { SkillLifecycleRepository } from '../../../src/repository/SkillLifecycleRepository.ts';
import { fixture, lifecycle, follow, period, reversed } from '../fixture/SkillEvidenceFixture.mjs';
const service = new SkillEvidenceService();
const conflict = (error) => error.code === 'evidence_conflict';

test('historical cohort lookups seek by attempt and activation keys instead of scanning older routes', (t) => {
    const { database } = fixture(t);
    const old = lifecycle('skill.routed', { occurred_at: '2026-08-01T00:00:00.000Z' });
    service.recordLifecycle(database, old);
    service.recordLifecycle(database, follow(old, 'skill.activated', period.from));
    const store = new SkillEvidenceDatabaseRepository(database);
    t.after(() => store.close());
    const seed = store.database.prepare('SELECT * FROM lifecycle_events LIMIT 1').get();
    store.database.exec('PRAGMA foreign_keys=OFF');
    const insert = store.database.prepare(
        'INSERT INTO lifecycle_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    store.transaction(() => {
        for (let index = 0; index < 2000; index += 1)
            insert.run(
                `older-route-${index}`,
                randomUUID(),
                seed.collection,
                seed.skill,
                seed.source_key,
                seed.identity_key,
                seed.source_json,
                seed.session,
                old.occurred_at,
                seed.recorded_at,
                'skill.routed',
                null,
            );
    });

    const prepare = store.database.prepare.bind(store.database);
    const plans = [];
    store.database.prepare = (sql) => {
        const statement = prepare(sql);
        if (!sql.startsWith('SELECT')) return statement;
        return new Proxy(statement, {
            get(target, name) {
                if (name !== 'get' && name !== 'all') return Reflect.get(target, name);
                return (...args) => {
                    plans.push({
                        sql,
                        details: prepare(`EXPLAIN QUERY PLAN ${sql}`)
                            .all(...args)
                            .map((row) => row.detail)
                            .join('\n'),
                    });
                    return target[name](...args);
                };
            },
        });
    };
    const rows = new SkillLifecycleRepository(store).metrics({
        ...period,
        collection: seed.collection,
        skill: seed.skill,
    }).rows;
    assert.equal(rows[0].activated_attempts, 1);
    assert.equal(rows[0].unmatched_activations, 0);
    assert.equal(rows[0].reactivations, 0);
    const attempt = plans.find((plan) => plan.sql.includes('correlation_id=?'));
    const activation = plans.find((plan) => plan.sql.includes('SELECT identity_key'));
    assert.match(
        attempt.details,
        /SEARCH lifecycle_events USING INDEX lifecycle_attempt \(correlation_id=\? AND collection=\? AND skill=\?\)/,
    );
    assert.match(
        activation.details,
        /SEARCH lifecycle_events USING INDEX lifecycle_activation \(collection=\? AND skill=\? AND source_key=\? AND event_type=\? AND occurred_at<\?\)/,
    );
    assert.doesNotMatch(`${attempt.details}\n${activation.details}`, /SCAN|TEMP B-TREE/);
});

test('canonical replay, unordered coherent stages, and source/session/terminal conflicts are atomic', (t) => {
    const { database } = fixture(t);
    const route = lifecycle('skill.routed', { occurred_at: '2026-09-19T10:00:00.000Z' });
    const active = follow(route, 'skill.activated', '2026-09-19T11:00:00.000Z');
    const complete = follow(route, 'skill.completed', '2026-09-19T12:00:00.000Z');
    assert.equal(service.recordLifecycle(database, complete).recorded, true);
    assert.equal(service.recordLifecycle(database, route).recorded, true);
    assert.equal(service.recordLifecycle(database, active).recorded, true);
    assert.equal(service.recordLifecycle(database, reversed(active)).recorded, false);
    const before = fs.readFileSync(database);
    for (const event of [
        { ...active, event_id: randomUUID() },
        { ...active, session: randomUUID() },
        follow(route, 'skill.blocked', '2026-09-19T12:00:00.000Z', 'missing_input'),
        {
            ...active,
            payload: {
                ...active.payload,
                source: { ...active.payload.source, package_sha256: 'e'.repeat(64) },
            },
        },
    ])
        assert.throws(() => service.recordLifecycle(database, event), conflict);
    assert.deepEqual(fs.readFileSync(database), before);
    const orphan = lifecycle();
    service.recordLifecycle(database, orphan);
    assert.throws(
        () =>
            service.recordLifecycle(
                database,
                follow(orphan, 'skill.routed', '2026-09-20T00:00:00.000Z'),
            ),
        conflict,
    );
    const migrated = new SkillReadRepository(database);
    assert.equal(migrated.rank().rows.length, 0); // Activation did not fabricate a read.
    assert.throws(() =>
        migrated.record({
            event_id: active.event_id,
            collection: 'demo',
            skill: 'example-skill',
            revision: 'legacy',
            session: 'opaque',
            occurred_at: active.occurred_at,
        }),
    );
    const old = {
        event_id: randomUUID(),
        collection: 'demo',
        skill: 'example-skill',
        revision: 'legacy',
        session: 'opaque',
        occurred_at: active.occurred_at,
    };
    migrated.record(old);
    migrated.close();
    assert.throws(
        () => service.recordLifecycle(database, { ...lifecycle(), event_id: old.event_id }),
        conflict,
    );
});

test('half-open cohorts distinguish cross-period evidence, unmatched stages and zero denominators', (t) => {
    const { database } = fixture(t);
    const route = lifecycle('skill.routed', { occurred_at: period.from });
    service.recordLifecycle(database, route);
    service.recordLifecycle(database, follow(route, 'skill.activated', '2026-09-02T00:00:00.000Z'));
    service.recordLifecycle(database, follow(route, 'skill.completed', period.until));
    const older = lifecycle('skill.routed', { occurred_at: '2026-08-31T23:59:59.999Z' });
    service.recordLifecycle(database, older);
    service.recordLifecycle(database, follow(older, 'skill.activated', '2026-09-03T00:00:00.000Z'));
    service.recordLifecycle(
        database,
        follow(older, 'skill.blocked', '2026-09-04T00:00:00.000Z', 'missing_input'),
    );
    const orphan = lifecycle('skill.completed');
    service.recordLifecycle(database, orphan);
    const pre = lifecycle('skill.blocked');
    pre.payload.reason = 'permission_required';
    service.recordLifecycle(database, pre);
    const before = fs.readFileSync(database);
    const result = service.query(database, 'lifecycle', period).rows[0];
    assert.equal(result.routed_attempts, 1);
    assert.equal(result.activated_attempts, 2);
    assert.deepEqual(result.route_conversion, { numerator: 1, denominator: 1, rate: 1 });
    assert.deepEqual(result.completion_rate, { numerator: 0, denominator: 2, rate: 0 });
    assert.deepEqual(result.block_rate, { numerator: 1, denominator: 2, rate: 0.5 });
    assert.equal(result.unmatched_outcomes, 2);
    assert.equal(result.pre_activation_blocks, 1);
    assert.equal(result.reactivations, 1);
    assert.equal(result.reasons.missing_input, 1);
    const buckets = service.query(database, 'lifecycle', { ...period, interval: 'day', limit: 1 });
    assert.equal(buckets.truncated, true);
    assert.equal(buckets.rows[0].route_conversion.rate, null);
    assert.equal(
        service.query(database, 'lifecycle', { ...period, interval: 'month' }).rows[0].period,
        '2026-09',
    );
    assert.deepEqual(fs.readFileSync(database), before);
});

test('reactivation separates revision changes and unrelated source identities', (t) => {
    const { database } = fixture(t);
    const first = lifecycle('skill.activated', { occurred_at: '2026-08-01T00:00:00.000Z' });
    service.recordLifecycle(database, first);
    const second = lifecycle();
    second.payload.source.package_sha256 = 'e'.repeat(64);
    service.recordLifecycle(database, second);
    const other = lifecycle();
    other.payload.source.repository = 'https://example.net/skills';
    service.recordLifecycle(database, other);
    const rows = service.query(database, 'lifecycle', period).rows;
    assert.equal(
        rows.find((row) => row.source.repository === 'https://example.org/skills').revision_changes,
        1,
    );
    assert.equal(
        rows.find((row) => row.source.repository === 'https://example.net/skills').reactivations,
        0,
    );
});

test('co-routing pairs use joint and union decisions and skill filtering keeps peers', (t) => {
    const { database } = fixture(t);
    const alpha = lifecycle('skill.routed');
    alpha.payload.skill = 'alpha';
    service.recordLifecycle(database, alpha);
    const beta = { ...alpha, event_id: randomUUID(), payload: { ...alpha.payload, skill: 'beta' } };
    service.recordLifecycle(database, beta);
    service.recordLifecycle(database, {
        ...alpha,
        event_id: randomUUID(),
        correlation_id: randomUUID(),
    });
    const result = service.query(database, 'overlap', { ...period, skill: 'alpha' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].joint_decisions, 1);
    assert.equal(result.rows[0].union_decisions, 2);
    assert.equal(result.rows[0].overlap.rate, 0.5);
    assert.throws(
        () =>
            service.recordLifecycle(database, {
                ...beta,
                event_id: randomUUID(),
                session: randomUUID(),
                payload: { ...beta.payload, skill: 'gamma' },
            }),
        conflict,
    );
});

test('period work bounds fail explicitly instead of returning incomplete cohort ratios', (t) => {
    const { database } = fixture(t);
    service.recordLifecycle(database, lifecycle());
    const store = new SkillEvidenceDatabaseRepository(database);
    const base = store.database.prepare('SELECT * FROM lifecycle_events LIMIT 1').get();
    // The synthetic bulk fixture bypasses public ingress only to reach the query bound quickly.
    store.database.exec('PRAGMA foreign_keys=OFF');
    const put = store.database.prepare(
        'INSERT INTO lifecycle_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    store.transaction(() => {
        for (let index = 0; index < 5000; index += 1)
            put.run(
                `bulk-${index}`,
                randomUUID(),
                base.collection,
                base.skill,
                base.source_key,
                base.identity_key,
                base.source_json,
                base.session,
                base.occurred_at,
                base.recorded_at,
                base.event_type,
                null,
            );
    });
    store.close();
    assert.throws(
        () => service.query(database, 'lifecycle', period),
        (error) => error.code === 'query_limit_exceeded',
    );
    assert.throws(
        () => service.query(database, 'overlap', period),
        (error) => error.code === 'query_limit_exceeded',
    );
    assert.deepEqual(service.query(database, 'lifecycle', { ...period, skill: 'absent' }).rows, []);
    assert.deepEqual(
        service.query(database, 'lifecycle', { ...period, collection: 'absent' }).rows,
        [],
    );
});
