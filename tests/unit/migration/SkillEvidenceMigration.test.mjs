// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { SkillReadMigration } from '../../../src/migration/SkillReadMigration.ts';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { SkillReadRepository } from '../../../src/repository/SkillReadRepository.ts';
import { fixture, lifecycle, period } from '../fixture/SkillEvidenceFixture.mjs';

// Issued historical SQL, intentionally independent of the current migration list.
const issued = [
    'CREATE TABLE usage_reads (event_id TEXT PRIMARY KEY, collection TEXT NOT NULL, skill TEXT NOT NULL, revision TEXT NOT NULL, session TEXT NOT NULL, occurred_at TEXT NOT NULL);\nCREATE INDEX usage_period ON usage_reads(occurred_at, collection, skill);',
    'CREATE TABLE usage_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, session TEXT NOT NULL, envelope TEXT NOT NULL);\nCREATE INDEX usage_events_period ON usage_events(occurred_at, event_type);',
];
function legacy(filename, version) {
    const db = new DatabaseSync(filename);
    db.exec('CREATE TABLE usage_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
    for (let index = 0; index < version; index += 1) {
        db.exec(issued[index]);
        db.prepare('INSERT INTO usage_migrations VALUES(?,?)').run(
            index + 1,
            createHash('sha256').update(issued[index]).digest('hex'),
        );
    }
    db.exec(
        "INSERT INTO usage_reads VALUES('old','demo','example-skill','unknown','opaque','2026-09-01T00:00:00.000Z')",
    );
    if (version === 2)
        db.exec(
            "INSERT INTO usage_events VALUES('old-start','session.started','2026-09-01T00:00:00.000Z','opaque','{\"historical\":true}')",
        );
    return db;
}

for (const version of [1, 2])
    test(`schema ${version} queries request an upgrade without mutation and migration 3 preserves old rows/checksums`, (t) => {
        const { database } = fixture(t);
        let db = legacy(database, version);
        const checksums = db.prepare('SELECT * FROM usage_migrations ORDER BY version').all();
        db.close();
        const before = fs.readFileSync(database);
        assert.throws(
            () => new SkillReadRepository(database, { readOnly: true }),
            (error) => error.code === 'schema_upgrade_required',
        );
        assert.throws(
            () => new SkillEvidenceService().query(database, 'lifecycle', period),
            (error) => error.code === 'schema_upgrade_required',
        );
        assert.deepEqual(fs.readFileSync(database), before);
        new SkillEvidenceService().recordLifecycle(database, lifecycle());
        db = new DatabaseSync(database, { readOnly: true });
        assert.deepEqual(
            db
                .prepare('SELECT * FROM usage_migrations WHERE version<=? ORDER BY version')
                .all(version),
            checksums,
        );
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usage_reads').get().n, 1);
        assert.equal(
            db.prepare('SELECT COUNT(*) AS n FROM usage_events').get().n,
            version === 1 ? 1 : 2,
        );
        db.close();
    });

test('a failure partway through new DDL rolls back schema and keeps the earlier database usable', (t) => {
    const { database } = fixture(t);
    const db = legacy(database, 2);
    const adapter = {
        prepare: (sql) => db.prepare(sql),
        exec: (sql) => {
            if (sql.startsWith('CREATE TABLE lifecycle_events')) {
                db.exec(sql.slice(0, sql.indexOf(';') + 1));
                throw new Error('synthetic migration failure');
            }
            db.exec(sql);
        },
    };
    assert.throws(
        () => new SkillReadMigration().migrateSkillReads(adapter),
        /synthetic migration failure/,
    );
    assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='lifecycle_events'").get().n,
        0,
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usage_migrations').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usage_reads').get().n, 1);
    new SkillReadMigration().migrateSkillReads(db);
    db.exec("INSERT INTO usage_migrations VALUES(4,'future')");
    db.close();
    const before = fs.readFileSync(database);
    assert.throws(
        () => new SkillEvidenceService().recordLifecycle(database, lifecycle()),
        (error) => error.code === 'storage_unavailable',
    );
    assert.deepEqual(fs.readFileSync(database), before);
});
