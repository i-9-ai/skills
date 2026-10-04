// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { SkillReadMigration } from '../../../src/migration/SkillReadMigration.ts';
import { SkillEvidenceDatabaseRepository } from '../../../src/repository/SkillEvidenceDatabaseRepository.ts';
import { SkillQualityRepository } from '../../../src/repository/SkillQualityRepository.ts';
import {
    createIssuedDatabase,
    issuedChecksums,
    verifyIssuedConsumer,
} from '../fixture/IssuedSkillEvidenceMigration.mjs';
import { assertion, fixture } from '../fixture/SkillQualityFixture.mjs';

function seed(database) {
    database.exec(
        "INSERT INTO usage_reads VALUES('old-read','demo','example-skill','unknown','opaque','2026-09-01T00:00:00.000Z')",
    );
    database.exec(
        "INSERT INTO usage_events VALUES('old-event','skill.activated','2026-09-01T00:00:00.000Z','opaque','{\"historical\":true}')",
    );
    database.exec(
        "INSERT INTO lifecycle_events VALUES('old-event','old-attempt','demo','example-skill','old-source','old-identity','{}','opaque','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','skill.activated',NULL)",
    );
    database.exec(
        "INSERT INTO usage_events VALUES('old-catalog','catalog.observed','2026-09-01T00:00:00.000Z','','{\"historical\":true}')",
    );
    database.exec(
        "INSERT INTO catalog_observations VALUES(1,'old-catalog','demo','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','{}','digest',1,1,0,0)",
    );
    database.exec(
        "INSERT INTO catalog_members VALUES(1,'example-skill','skills/example-skill','package','metadata','2026-09-01T00:00:00.000Z')",
    );
    database.exec(
        "INSERT INTO catalog_changes VALUES(1,'example-skill','added',NULL,'{\"historical\":true}')",
    );
}
const tables = [
    'usage_reads',
    'usage_events',
    'lifecycle_events',
    'catalog_observations',
    'catalog_members',
    'catalog_changes',
];
const rows = (database) =>
    Object.fromEntries(
        tables.map((table) => [table, database.prepare(`SELECT * FROM ${table}`).all()]),
    );

for (const version of [1, 2, 3])
    test(`issued schema ${version} requires a read-only explicit upgrade without byte changes`, (t) => {
        const target = fixture(t);
        createIssuedDatabase(target.database, version).close();
        const before = fs.readFileSync(target.database);
        assert.throws(
            () => new SkillEvidenceDatabaseRepository(target.database, { readOnly: true }),
            (error) => error.code === 'schema_upgrade_required',
        );
        assert.deepEqual(fs.readFileSync(target.database), before);
        assert.deepEqual(fs.readdirSync(target.root), ['evidence.db']);
    });

test('issued migrations 1–3 queries never upgrade; explicit 3→4 preserves every existing projection and checksum', (t) => {
    const target = fixture(t);
    let database = createIssuedDatabase(target.database);
    seed(database);
    const beforeRows = rows(database);
    const beforeMigrations = database
        .prepare('SELECT * FROM usage_migrations ORDER BY version')
        .all();
    database.close();
    const bytes = fs.readFileSync(target.database);
    assert.throws(
        () => new SkillEvidenceDatabaseRepository(target.database, { readOnly: true }),
        (error) => error.code === 'schema_upgrade_required',
    );
    assert.deepEqual(fs.readFileSync(target.database), bytes);
    assert.deepEqual(fs.readdirSync(target.root), ['evidence.db']);
    const connection = new SkillEvidenceDatabaseRepository(target.database);
    assert.deepEqual(rows(connection.database), beforeRows);
    assert.deepEqual(
        connection.database
            .prepare('SELECT * FROM usage_migrations WHERE version<=3 ORDER BY version')
            .all(),
        beforeMigrations,
    );
    assert.deepEqual(
        beforeMigrations.map((row) => row.checksum),
        issuedChecksums,
    );
    new SkillQualityRepository(connection).record(assertion());
    connection.close();
    const upgraded = fs.readFileSync(target.database);
    database = new DatabaseSync(target.database, { readOnly: true });
    assert.throws(() => verifyIssuedConsumer(database), /Unsupported or altered usage migration/);
    database.close();
    assert.deepEqual(fs.readFileSync(target.database), upgraded);
});

test('untracked quality table is rejected without mutation', (t) => {
    const target = fixture(t);
    const database = createIssuedDatabase(target.database);
    database.exec('CREATE TABLE quality_receipts(untracked TEXT)');
    database.close();
    const before = fs.readFileSync(target.database);
    assert.throws(
        () => new SkillEvidenceDatabaseRepository(target.database),
        /Untracked quality schema/,
    );
    assert.deepEqual(fs.readFileSync(target.database), before);
});

test('partial migration-4 DDL rolls back atomically and preserves issued rows/history', (t) => {
    const target = fixture(t);
    const database = createIssuedDatabase(target.database);
    seed(database);
    const before = rows(database);
    const adapter = {
        prepare: (sql) => database.prepare(sql),
        exec: (sql) => {
            if (sql.startsWith('CREATE TABLE quality_receipts')) {
                database.exec(sql.slice(0, sql.indexOf(';') + 1));
                throw new Error('synthetic quality DDL failure');
            }
            database.exec(sql);
        },
    };
    assert.throws(
        () => new SkillReadMigration().migrateSkillReads(adapter),
        /synthetic quality DDL failure/,
    );
    assert.equal(
        database
            .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='quality_receipts'")
            .get().n,
        0,
    );
    assert.deepEqual(rows(database), before);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM usage_migrations').get().n, 3);
    database.close();
});

test('missing read-only storage, future schema 5 and altered checksums fail without file creation/reset', (t) => {
    const missing = fixture(t);
    assert.throws(() => new SkillEvidenceDatabaseRepository(missing.database, { readOnly: true }));
    assert.deepEqual(fs.readdirSync(missing.root), []);
    for (const mutation of [
        (database) => database.exec("INSERT INTO usage_migrations VALUES(5,'future')"),
        (database) =>
            database.exec("UPDATE usage_migrations SET checksum='altered' WHERE version=3"),
    ]) {
        const target = fixture(t);
        const connection = new SkillEvidenceDatabaseRepository(target.database);
        mutation(connection.database);
        connection.close();
        const before = fs.readFileSync(target.database);
        assert.throws(() => new SkillEvidenceDatabaseRepository(target.database));
        assert.throws(
            () => new SkillEvidenceDatabaseRepository(target.database, { readOnly: true }),
        );
        assert.deepEqual(fs.readFileSync(target.database), before);
    }
});
