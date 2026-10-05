// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { SkillMemoryService } from '../../../src/service/SkillMemoryService.ts';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { SkillReadRepository } from '../../../src/repository/SkillReadRepository.ts';
import { SkillMemoryRepository } from '../../../src/repository/SkillMemoryRepository.ts';
import { SkillEvidenceDatabaseRepository } from '../../../src/repository/SkillEvidenceDatabaseRepository.ts';
import { SkillLifecycleRepository } from '../../../src/repository/SkillLifecycleRepository.ts';
import { CatalogObservationRepository } from '../../../src/repository/CatalogObservationRepository.ts';
import {
    fixture,
    lifecycle,
    follow,
    catalog,
    member,
    period,
} from '../fixture/SkillEvidenceFixture.mjs';
import { memoryQuery, read, telemetry } from '../fixture/SkillMemoryFixture.mjs';

const service = new SkillMemoryService();
const evidence = new SkillEvidenceService();
const fails = (code) => (error) => error.code === code;
const initialize = (database) => new SkillReadRepository(database).close();

function unchanged(target, operation) {
    const before = fs.readFileSync(target.database);
    const files = fs.readdirSync(target.root).sort();
    const result = operation();
    assert.deepEqual(fs.readFileSync(target.database), before);
    assert.deepEqual(fs.readdirSync(target.root).sort(), files);
    return result;
}

test('summary preserves source collisions and weaker revisions even when display is limited', (t) => {
    const target = fixture(t);
    const first = lifecycle();
    const otherSource = lifecycle();
    otherSource.payload.source.repository = 'https://example.net/skills';
    const otherRevision = lifecycle();
    otherRevision.payload.source.package_sha256 = 'e'.repeat(64);
    for (const event of [otherRevision, otherSource, first])
        evidence.recordLifecycle(target.database, event);
    const reader = new SkillReadRepository(target.database);
    try {
        for (let index = 0; index < 30; index += 1) reader.record(read({ skill: 'popular-peer' }));
        reader.record(read());
        reader.record(read({ revision: 'revision-b' }));
        reader.record(read({ collection: 'other-collection' }));
    } finally {
        reader.close();
    }
    const query = { ...memoryQuery, skill: 'example-skill' };
    const result = unchanged(target, () => service.summarize(target.database, query));
    assert.equal(result.lifecycle.rows.length, 3);
    assert.equal(new Set(result.lifecycle.rows.map((row) => row.identity_key)).size, 3);
    assert.deepEqual(result.lifecycle_source_collisions.rows, [
        { skill: 'example-skill', sources: 2, identities: 3 },
    ]);
    assert.equal(result.read_observations.source_attribution, 'unavailable');
    assert.equal(result.read_observations.reads, 2);
    assert.deepEqual(
        result.read_observations.rows.map((row) => row.revision),
        ['revision-a', 'revision-b'],
    );
    assert.ok(
        result.read_observations.rows.every(
            (row) => !('source' in row) && !('identity_key' in row),
        ),
    );
    assert.deepEqual(service.summarize(target.database, query), result);
    const limited = service.summarize(target.database, { ...query, limit: 1 });
    assert.equal(limited.truncated, true);
    assert.equal(limited.lifecycle.rows.length, 1);
    assert.equal(limited.lifecycle_source_collisions.skills, 1);
    assert.equal(limited.lifecycle_source_collisions.identities, 3);
    assert.deepEqual(
        limited.lifecycle_source_collisions.rows,
        result.lifecycle_source_collisions.rows,
    );
    assert.equal(limited.read_observations.reads, 2);
    assert.equal(limited.read_observations.rows[0].skill, 'example-skill');
    assert.equal(limited.read_observations.truncated, true);
    const serialized = JSON.stringify(result);
    for (const event of [first, otherSource, otherRevision]) {
        assert.equal(serialized.includes(event.session), false);
        assert.equal(serialized.includes(event.correlation_id), false);
    }
    assert.doesNotMatch(serialized, /source_json|envelope/);
});

test('pre-window attempts support explicit denominators without inventing official receipts', (t) => {
    const target = fixture(t);
    const route = lifecycle('skill.routed', { occurred_at: '2026-08-31T00:00:00.000Z' });
    evidence.recordLifecycle(target.database, route);
    evidence.recordLifecycle(
        target.database,
        follow(route, 'skill.activated', '2026-09-02T00:00:00.000Z'),
    );
    evidence.recordLifecycle(
        target.database,
        follow(route, 'skill.completed', '2026-09-03T00:00:00.000Z'),
    );
    const blocked = lifecycle('skill.blocked');
    blocked.payload.reason = 'validation_failed';
    evidence.recordLifecycle(target.database, blocked);
    const result = unchanged(target, () => service.summarize(target.database, memoryQuery));
    const row = result.lifecycle.rows[0];
    assert.equal(row.event_counts['skill.routed'], 0);
    assert.equal(row.unmatched_activations, 0);
    assert.deepEqual(row.route_conversion, { numerator: 0, denominator: 0, rate: null });
    assert.deepEqual(row.completion_rate, { numerator: 1, denominator: 1, rate: 1 });
    assert.equal(row.reasons.validation_failed, 1);
    assert.ok(Object.values(result.receipt_schemas).every((value) => value === 'not_recorded'));
    assert.equal(result.limits_of_inference.caller_reason_is_validation_receipt, false);
    assert.equal(result.catalog_inactivity.status, 'catalog_unobserved');
});

test('catalog coverage separates changed-skill history, current inactivity and retention membership', (t) => {
    const target = fixture(t);
    evidence.recordCatalog(target.database, catalog([member('alpha'), member('beta')]));
    evidence.recordCatalog(
        target.database,
        catalog([member('alpha')], { occurred_at: '2026-09-02T00:00:00.000Z' }),
    );
    evidence.recordCatalog(
        target.database,
        catalog([member('alpha')], { occurred_at: '2026-09-03T00:00:00.000Z' }),
    );
    const summary = unchanged(target, () => service.summarize(target.database, memoryQuery));
    assert.equal(summary.catalog_history.observations.length, 2);
    assert.equal(summary.catalog_history.delta_counts_scope, 'complete_collection_observation');
    assert.equal(summary.catalog_inactivity.rows[0].skill, 'alpha');
    assert.equal(summary.catalog_inactivity.rows[0].observed_entire_period, true);
    assert.equal(summary.catalog_inactivity.rows[0].activations, 0);
    const beta = service.summarize(target.database, { ...memoryQuery, skill: 'beta' });
    assert.equal(beta.catalog_history.observations.length, 1);
    assert.equal(beta.catalog_history.observations[0].removed, 1);
    assert.deepEqual(beta.catalog_inactivity.rows, []);
    const alphaRetention = service.retention(target.database, { ...memoryQuery, skill: 'alpha' });
    const betaRetention = service.retention(target.database, { ...memoryQuery, skill: 'beta' });
    assert.equal(alphaRetention.total.count, 2);
    assert.equal(betaRetention.total.count, 1);
    assert.equal(betaRetention.coverage.outside_window_history, 'unassessed');
});

test('retention uses an exact cutoff and counts each mirrored occurrence once', (t) => {
    const target = fixture(t);
    const cutoff = '2026-09-15T00:00:00.000Z';
    const activation = lifecycle('skill.activated', { occurred_at: '2026-09-14T00:00:00.000Z' });
    evidence.recordLifecycle(target.database, activation);
    evidence.recordLifecycle(target.database, follow(activation, 'skill.completed', cutoff));
    evidence.recordCatalog(
        target.database,
        catalog(undefined, { occurred_at: '2026-09-10T00:00:00.000Z' }),
    );
    const reader = new SkillReadRepository(target.database);
    try {
        reader.record(read({ occurred_at: period.from }));
        reader.recordEvent(telemetry());
        reader.recordEvent(telemetry('skill.read.attempted'));
        reader.recordEvent(telemetry('session.started'));
        reader.recordEvent(telemetry('skill.read.observed', { occurred_at: period.until }));
        reader.record(read({ collection: 'other-collection' }));
    } finally {
        reader.close();
    }
    const query = { ...memoryQuery, skill: 'example-skill', cutoff };
    const result = unchanged(target, () => service.retention(target.database, query));
    assert.equal(result.policy.status, 'inspected');
    assert.equal(result.policy.persisted, false);
    assert.equal(result.policy.deletion_authorized, false);
    assert.equal(result.total.count, 6);
    assert.equal(result.before_cutoff.count, 3);
    assert.equal(result.at_or_after_cutoff.count, 3);
    assert.equal(result.at_or_after_cutoff.first_occurred_at, cutoff);
    assert.equal(result.total.first_occurred_at, period.from);
    assert.equal(
        result.families.rows.find((row) => row.family === 'read_observations').total.count,
        2,
    );
    const noPolicy = service.retention(target.database, memoryQuery);
    assert.equal(noPolicy.policy.status, 'policy_not_supplied');
    assert.equal(noPolicy.policy.cutoff, null);
    assert.equal(noPolicy.before_cutoff, null);
    assert.equal(noPolicy.at_or_after_cutoff, null);
    const limited = service.retention(target.database, { ...query, limit: 1 });
    assert.equal(limited.total.count, 6);
    assert.equal(limited.families.truncated, true);
    assert.equal(limited.families.rows.length, 1);
    assert.deepEqual(service.retention(target.database, query), result);
});

test('invalid input fails before storage and cannot select mutation or a default policy', (t) => {
    const target = fixture(t);
    const absent = path.join(target.root, 'not-created', 'evidence.db');
    const invalid = [
        {},
        { ...memoryQuery, collection: undefined },
        { ...memoryQuery, collection: '../private' },
        { ...memoryQuery, skill: 'invalid/skill' },
        { ...memoryQuery, limit: 0 },
        { ...memoryQuery, limit: 101 },
        { ...memoryQuery, limit: 1.5 },
        { ...memoryQuery, from: '2025-01-01T00:00:00.000Z' },
        { ...memoryQuery, until: memoryQuery.from },
        { ...memoryQuery, from: '2026-09-01' },
        { ...memoryQuery, apply: true },
        { ...memoryQuery, prompt: 'private-value' },
        { ...memoryQuery, cutoff: '2026-08-31T00:00:00.000Z' },
        { ...memoryQuery, cutoff: memoryQuery.until },
        { ...memoryQuery, cutoff: null },
        { ...memoryQuery, collection: 'x'.repeat(5000) },
    ];
    for (const query of invalid)
        assert.throws(() => service.retention(absent, query), fails('invalid_input'));
    assert.throws(
        () => service.summarize(absent, { ...memoryQuery, cutoff: period.from }),
        fails('invalid_input'),
    );
    assert.throws(() => service.summarize('relative.db', memoryQuery), fails('invalid_input'));
    assert.equal(fs.existsSync(path.dirname(absent)), false);
    assert.deepEqual(fs.readdirSync(target.root), ['home']);
});

test('empty, missing, old and altered schemas never get created or upgraded by inspection', (t) => {
    const target = fixture(t);
    for (const operation of ['summarize', 'retention']) {
        assert.throws(
            () => service[operation](target.database, memoryQuery),
            fails('storage_unavailable'),
        );
        assert.equal(fs.existsSync(target.database), false);
    }
    initialize(target.database);
    unchanged(target, () => {
        assert.equal(service.summarize(target.database, memoryQuery).read_observations.reads, 0);
        assert.equal(service.retention(target.database, memoryQuery).total.count, 0);
    });
    const old = new DatabaseSync(target.database);
    old.exec(
        'DROP TABLE quality_receipts; DROP TABLE catalog_changes; DROP TABLE catalog_members; DROP TABLE catalog_observations; DROP TABLE lifecycle_events; DELETE FROM usage_migrations WHERE version>=3;',
    );
    old.close();
    unchanged(target, () => {
        for (const operation of ['summarize', 'retention'])
            assert.throws(
                () => service[operation](target.database, memoryQuery),
                fails('schema_upgrade_required'),
            );
    });
    const altered = new DatabaseSync(target.database);
    altered.prepare('UPDATE usage_migrations SET checksum=? WHERE version=1').run('0'.repeat(64));
    altered.close();
    unchanged(target, () =>
        assert.throws(
            () => service.summarize(target.database, memoryQuery),
            fails('storage_unavailable'),
        ),
    );
});

for (const family of ['lifecycle', 'catalog', 'reads', 'envelopes']) {
    test(`${family} scan bounds fail before sparse filtering and preserve database bytes`, (t) => {
        const target = fixture(t);
        initialize(target.database);
        const store = new SkillEvidenceDatabaseRepository(target.database);
        store.database.exec('PRAGMA foreign_keys=OFF');
        const inserts = {
            lifecycle: [
                'INSERT INTO lifecycle_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (index) => [
                    `event-${index}`,
                    `attempt-${index}`,
                    'demo',
                    'example-skill',
                    'a'.repeat(64),
                    'b'.repeat(64),
                    '{}',
                    'session',
                    period.from,
                    period.from,
                    'skill.activated',
                    null,
                ],
            ],
            catalog: [
                'INSERT INTO catalog_observations(event_id,collection,occurred_at,recorded_at,source_json,catalog_sha256,members,added,changed,removed) VALUES(?,?,?,?,?,?,?,?,?,?)',
                (index) => [
                    `event-${index}`,
                    'demo',
                    period.from,
                    period.from,
                    '{}',
                    'a'.repeat(64),
                    0,
                    0,
                    0,
                    0,
                ],
            ],
            reads: [
                'INSERT INTO usage_reads VALUES(?,?,?,?,?,?)',
                (index) => [
                    `event-${index}`,
                    'unselected',
                    'other-skill',
                    'revision',
                    'session',
                    period.from,
                ],
            ],
            envelopes: [
                'INSERT INTO usage_events VALUES(?,?,?,?,?)',
                (index) => [`event-${index}`, 'session.started', period.from, 'session', '{}'],
            ],
        };
        const [sql, values] = inserts[family];
        const put = store.database.prepare(sql);
        store.transaction(() => {
            for (let index = 0; index <= 5000; index += 1) put.run(...values(index));
        });
        store.close();
        unchanged(target, () => {
            assert.throws(
                () => service.retention(target.database, memoryQuery),
                fails('query_limit_exceeded'),
            );
            if (family !== 'envelopes')
                assert.throws(
                    () => service.summarize(target.database, memoryQuery),
                    fails('query_limit_exceeded'),
                );
        });
    });
}

test('the exact 5000-read boundary remains complete instead of silently truncating work', (t) => {
    const target = fixture(t);
    initialize(target.database);
    const store = new SkillEvidenceDatabaseRepository(target.database);
    const put = store.database.prepare('INSERT INTO usage_reads VALUES(?,?,?,?,?,?)');
    store.transaction(() => {
        for (let index = 0; index < 5000; index += 1)
            put.run(`event-${index}`, 'demo', 'example-skill', 'revision', 'session', period.from);
    });
    store.close();
    unchanged(target, () => {
        const summary = service.summarize(target.database, memoryQuery);
        assert.equal(summary.read_observations.reads, 5000);
        assert.equal(summary.read_observations.truncated, false);
        assert.equal(service.retention(target.database, memoryQuery).total.count, 5000);
    });
});

test('serialized byte cap fails explicitly and a smaller display preserves collision disclosure', (t) => {
    const target = fixture(t);
    for (let index = 0; index < 40; index += 1) {
        const event = lifecycle();
        event.payload.source.repository = `https://example.org/${'r'.repeat(1800)}/${index}`;
        event.payload.source.package_path = `skills/${'p'.repeat(900)}`;
        evidence.recordLifecycle(target.database, event);
    }
    unchanged(target, () =>
        assert.throws(
            () => service.summarize(target.database, { ...memoryQuery, limit: 100 }),
            fails('response_too_large'),
        ),
    );
    const compact = unchanged(target, () =>
        service.summarize(target.database, { ...memoryQuery, limit: 1 }),
    );
    assert.equal(compact.truncated, true);
    assert.equal(compact.lifecycle_source_collisions.rows[0].sources, 40);
    assert.ok(Buffer.byteLength(JSON.stringify(compact)) <= 65536);
});

test('summary holds one snapshot while another connection records newer reads', (t) => {
    const target = fixture(t);
    evidence.recordLifecycle(target.database, lifecycle());
    const writer = new DatabaseSync(target.database);
    writer.exec('PRAGMA journal_mode=WAL');
    const store = new SkillEvidenceDatabaseRepository(target.database, { readOnly: true });
    const original = store.database.prepare.bind(store.database);
    let inserted = false;
    store.database.prepare = (sql) => {
        if (!inserted && sql.includes('FROM usage_reads')) {
            inserted = true;
            const event = read();
            writer
                .prepare('INSERT INTO usage_reads VALUES(?,?,?,?,?,?)')
                .run(...Object.values(event));
        }
        return original(sql);
    };
    try {
        const result = new SkillMemoryRepository(store).summarize(memoryQuery);
        assert.equal(inserted, true);
        assert.equal(result.read_observations.reads, 0);
    } finally {
        store.close();
        writer.close();
    }
    assert.equal(service.summarize(target.database, memoryQuery).read_observations.reads, 1);
});

test('composable projection entrypoints still validate inputs before reading', (t) => {
    const target = fixture(t);
    initialize(target.database);
    const store = new SkillEvidenceDatabaseRepository(target.database, { readOnly: true });
    try {
        for (const [repository, method] of [
            [new SkillLifecycleRepository(store), 'projectMetrics'],
            [new CatalogObservationRepository(store), 'projectHistory'],
            [new CatalogObservationRepository(store), 'projectInactivity'],
        ]) {
            assert.throws(
                () => repository[method]({ ...memoryQuery, limit: 101 }),
                fails('invalid_input'),
            );
            assert.throws(
                () => repository[method]({ ...memoryQuery, arbitrary: true }),
                fails('invalid_input'),
            );
        }
    } finally {
        store.close();
    }
});
