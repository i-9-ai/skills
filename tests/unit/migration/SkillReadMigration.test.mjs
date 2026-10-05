// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SkillReadMigration } from '../../../src/migration/SkillReadMigration.ts';

test('reapplying migrations preserves rows and a future migration rejects without reset', (t) => {
    const database = new DatabaseSync(':memory:');
    t.after(() => database.close());
    const migration = new SkillReadMigration();
    migration.migrateSkillReads(database);
    database.exec(
        "INSERT INTO usage_reads VALUES ('event', 'collection', 'skill', 'revision', 'session', '2026-09-15T00:00:00.000Z')",
    );
    migration.migrateSkillReads(database);
    assert.equal(database.prepare('SELECT count(*) AS count FROM usage_reads').get().count, 1);

    database.exec("INSERT INTO usage_migrations VALUES (5, 'future')");
    assert.throws(() => migration.migrateSkillReads(database), /Unsupported usage migration/);
    assert.equal(database.prepare('SELECT count(*) AS count FROM usage_reads').get().count, 1);
    assert.equal(database.prepare('SELECT count(*) AS count FROM usage_migrations').get().count, 5);
});

test('untracked read tables leave no partial migration ledger after rejection', (t) => {
    const database = new DatabaseSync(':memory:');
    t.after(() => database.close());
    database.exec('CREATE TABLE usage_reads(sentinel TEXT)');

    assert.throws(
        () => new SkillReadMigration().migrateSkillReads(database),
        /Untracked usage schema/,
    );
    assert.equal(
        database
            .prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='usage_migrations'")
            .get().count,
        0,
    );
});
