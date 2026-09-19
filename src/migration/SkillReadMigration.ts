// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

// Preserve the already-issued SQL bytes: the checksum is a migration identity.
const initialSql = `CREATE TABLE usage_reads (event_id TEXT PRIMARY KEY, collection TEXT NOT NULL, skill TEXT NOT NULL, revision TEXT NOT NULL, session TEXT NOT NULL, occurred_at TEXT NOT NULL);
CREATE INDEX usage_period ON usage_reads(occurred_at, collection, skill);`;

const telemetrySql = `CREATE TABLE usage_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, session TEXT NOT NULL, envelope TEXT NOT NULL);
CREATE INDEX usage_events_period ON usage_events(occurred_at, event_type);`;

const migrations = [
    {
        version: 1,
        sql: initialSql,
        checksum: createHash('sha256').update(initialSql).digest('hex'),
    },
    {
        version: 2,
        sql: telemetrySql,
        checksum: createHash('sha256').update(telemetrySql).digest('hex'),
    },
];

/** Serializes schema upgrades while preserving verified migration history. */
export class SkillReadMigration {
    /** Queries never create or upgrade a database; record opens own that transition. */
    verifySkillReads(database: DatabaseSync): void {
        const applied = database
            .prepare('SELECT version, checksum FROM usage_migrations ORDER BY version')
            .all();
        if (
            applied.length !== migrations.length ||
            applied.some(
                (row, index) =>
                    row.version !== migrations[index].version ||
                    row.checksum !== migrations[index].checksum,
            )
        ) {
            throw new Error('Usage database requires a supported explicit schema upgrade');
        }
        const names = database
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .all()
            .map((row) => row.name);
        if (
            JSON.stringify(names) !==
            JSON.stringify(['usage_events', 'usage_migrations', 'usage_reads'])
        ) {
            throw new Error('Unexpected usage database schema');
        }
    }

    /** Apply known migrations atomically; reject catalog DBs and changed history. */
    migrateSkillReads(database: DatabaseSync): void {
        database.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');

        try {
            const tables = database
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                )
                .all();
            const allowedTables = new Set(['usage_migrations', 'usage_reads', 'usage_events']);

            if (tables.some((table) => !allowedTables.has(String(table.name)))) {
                throw new Error(
                    'Dedicated usage database required; catalog databases are not supported',
                );
            }

            database.exec(
                'CREATE TABLE IF NOT EXISTS usage_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)',
            );
            const applied = database
                .prepare('SELECT * FROM usage_migrations ORDER BY version')
                .all();

            if (applied.length > migrations.length) throw new Error('Unsupported usage migration');
            if (applied.length === 0 && tables.some((table) => table.name === 'usage_reads')) {
                throw new Error('Untracked usage schema');
            }
            if (applied.length < 2 && tables.some((table) => table.name === 'usage_events')) {
                throw new Error('Untracked telemetry schema');
            }

            for (const [index, row] of applied.entries()) {
                const expected = migrations[index];
                if (row.version !== expected.version || row.checksum !== expected.checksum) {
                    throw new Error('Unsupported or altered usage migration');
                }
            }

            for (const migration of migrations.slice(applied.length)) {
                database.exec(migration.sql);
                database
                    .prepare('INSERT INTO usage_migrations VALUES(?, ?)')
                    .run(migration.version, migration.checksum);
            }

            database.exec('COMMIT');
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
    }
}
