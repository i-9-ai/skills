// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { SkillEvidenceDatabaseRepository } from '../../../src/repository/SkillEvidenceDatabaseRepository.ts';
import {
    rebuildAggregateIndex,
    syncAggregateIndex,
} from '../../../.agents/skills/skills-catalog-index/scripts/aggregate_index.mjs';
import {
    fixture,
    lifecycle,
    catalog,
    member,
    period,
    reversed,
} from '../fixture/SkillEvidenceFixture.mjs';
const service = new SkillEvidenceService();

test('catalog history records unchanged/add/change/remove/re-add and pages member detail independently', (t) => {
    const { database } = fixture(t);
    const first = catalog([member('alpha'), member('beta')]);
    assert.equal(service.recordCatalog(database, first).added, 2);
    assert.equal(service.recordCatalog(database, reversed(first)).recorded, false);
    const same = { ...first, event_id: randomUUID(), occurred_at: '2026-09-01T00:00:00.000Z' };
    const unchanged = service.recordCatalog(database, same);
    assert.equal(unchanged.changed, 0);
    assert.equal(unchanged.added, 0);
    const second = catalog([member('beta', { metadata_sha256: 'e'.repeat(64) }), member('gamma')], {
        occurred_at: '2026-09-02T00:00:00.000Z',
    });
    const delta = service.recordCatalog(database, second);
    assert.deepEqual([delta.added, delta.changed, delta.removed], [1, 1, 1]);
    const page = service.query(database, 'history', {
        ...period,
        observation_sequence: delta.sequence,
        limit: 1,
    });
    assert.equal(page.changes[0].skill, 'alpha');
    assert.equal(page.changes[0].after, null);
    assert.equal(page.next_skill, 'alpha');
    const next = service.query(database, 'history', {
        ...period,
        observation_sequence: delta.sequence,
        after_skill: page.next_skill,
        limit: 1,
    });
    assert.equal(next.changes[0].skill, 'beta');
    assert.equal(next.changes[0].change_type, 'changed');
    const headers = service.query(database, 'history', { ...period, limit: 1 });
    assert.equal(headers.truncated, true);
    assert.equal(
        service.query(database, 'history', { ...period, after_sequence: headers.next_sequence })
            .observations.length,
        1,
    );
    service.recordCatalog(
        database,
        catalog([member('alpha')], { occurred_at: '2026-09-03T00:00:00.000Z' }),
    );
    const result = service.query(database, 'inactivity', period).rows[0];
    assert.equal(result.first_seen_at, '2026-09-03T00:00:00.000Z');
    assert.equal(result.observed_entire_period, false);
    const before = fs.readFileSync(database);
    assert.throws(
        () => service.recordCatalog(database, { ...second, event_id: randomUUID() }),
        (error) => error.code === 'evidence_conflict',
    );
    assert.deepEqual(fs.readFileSync(database), before);
});

test('inactivity uses catalog evidence before until and logical source activity across revisions', (t) => {
    const { database } = fixture(t);
    service.recordLifecycle(database, lifecycle());
    assert.throws(
        () => service.query(database, 'inactivity', period),
        (error) => error.code === 'catalog_unobserved',
    );
    service.recordCatalog(database, catalog([member(), member('idle')]));
    service.recordCatalog(
        database,
        catalog([member('example-skill', { package_sha256: 'f'.repeat(64) }), member('idle')], {
            occurred_at: '2026-09-20T00:00:00.000Z',
        }),
    );
    service.recordCatalog(database, catalog([], { occurred_at: period.until }));
    const before = fs.readFileSync(database);
    const result = service.query(database, 'inactivity', period);
    assert.deepEqual(
        result.rows.map((row) => row.skill),
        ['idle'],
    );
    assert.equal(result.rows[0].observed_entire_period, true);
    assert.equal(
        service.query(database, 'inactivity', { ...period, until: '2026-10-02T00:00:00.000Z' }).rows
            .length,
        0,
    );
    assert.deepEqual(fs.readFileSync(database), before);
});

test('aggregate reset and sync reject dedicated evidence databases without changing history bytes', async (t) => {
    const { root } = fixture(t);
    const output = path.join(root, 'output');
    fs.mkdirSync(output);
    const database = path.join(output, 'skills-catalog.db');
    service.recordLifecycle(database, lifecycle());
    service.recordCatalog(database, catalog());
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    const filename = path.join(source, 'skills-catalog.json');
    fs.writeFileSync(
        filename,
        JSON.stringify({
            schema_version: 1,
            skills: [
                {
                    name: 'example-skill',
                    path: 'skills/example-skill',
                    description: 'Use for a synthetic fixture.',
                    tags: [],
                },
            ],
        }),
    );
    const before = fs.readFileSync(database);
    for (const operation of [rebuildAggregateIndex, syncAggregateIndex])
        await assert.rejects(
            operation({
                sources: [`demo=${filename}`],
                output,
                format: 'sqlite',
                resetHistory: true,
            }),
            /dedicated evidence databases/,
        );
    assert.deepEqual(fs.readFileSync(database), before);
    assert.equal(service.query(database, 'lifecycle', period).rows[0].activated_attempts, 1);
    const safe = path.join(root, 'derived');
    await rebuildAggregateIndex({ sources: [`demo=${filename}`], output: safe, format: 'sqlite' });
    await rebuildAggregateIndex({
        sources: [`demo=${filename}`],
        output: safe,
        format: 'sqlite',
        resetHistory: true,
    });
});

test('catalog history and unfiltered inactivity bound candidates before sparse filters', (t) => {
    const { database } = fixture(t);
    service.recordCatalog(database, catalog([], { occurred_at: period.from }));
    const store = new SkillEvidenceDatabaseRepository(database);
    const base = store.database.prepare('SELECT * FROM catalog_observations LIMIT 1').get();
    store.database.exec('PRAGMA foreign_keys=OFF');
    const put = store.database.prepare(
        'INSERT INTO catalog_observations(event_id,collection,occurred_at,recorded_at,source_json,catalog_sha256,members,added,changed,removed) VALUES(?,?,?,?,?,?,?,?,?,?)',
    );
    store.transaction(() => {
        for (let index = 1; index <= 5000; index += 1)
            put.run(
                `synthetic-${index}`,
                base.collection,
                new Date(Date.parse(period.from) + index).toISOString(),
                base.recorded_at,
                base.source_json,
                base.catalog_sha256,
                0,
                0,
                0,
                0,
            );
    });
    store.close();
    const before = fs.readFileSync(database);
    assert.throws(
        () =>
            service.query(database, 'history', {
                ...period,
                skill: 'absent',
                after_sequence: 5000,
            }),
        (error) => error.code === 'query_limit_exceeded',
    );
    assert.throws(
        () => service.query(database, 'inactivity', period),
        (error) => error.code === 'query_limit_exceeded',
    );
    assert.deepEqual(
        service.query(database, 'inactivity', { ...period, collection: 'demo' }).rows,
        [],
    );
    assert.deepEqual(
        service.query(database, 'history', { ...period, collection: 'absent' }).observations,
        [],
    );
    assert.deepEqual(fs.readFileSync(database), before);
});
