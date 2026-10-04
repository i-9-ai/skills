// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

// Preserve the already-issued SQL bytes: the checksum is a migration identity.
const initialSql = `CREATE TABLE usage_reads (event_id TEXT PRIMARY KEY, collection TEXT NOT NULL, skill TEXT NOT NULL, revision TEXT NOT NULL, session TEXT NOT NULL, occurred_at TEXT NOT NULL);
CREATE INDEX usage_period ON usage_reads(occurred_at, collection, skill);`;

const telemetrySql = `CREATE TABLE usage_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, session TEXT NOT NULL, envelope TEXT NOT NULL);
CREATE INDEX usage_events_period ON usage_events(occurred_at, event_type);`;

const lifecycleSql = `CREATE TABLE lifecycle_events (
event_id TEXT PRIMARY KEY REFERENCES usage_events(event_id), correlation_id TEXT NOT NULL, collection TEXT NOT NULL, skill TEXT NOT NULL,
source_key TEXT NOT NULL, identity_key TEXT NOT NULL, source_json TEXT NOT NULL, session TEXT NOT NULL,
occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL, event_type TEXT NOT NULL, reason TEXT,
UNIQUE(correlation_id, collection, skill, event_type));
CREATE INDEX lifecycle_period ON lifecycle_events(occurred_at, event_id);
CREATE INDEX lifecycle_collection_period ON lifecycle_events(collection, occurred_at, event_id);
CREATE INDEX lifecycle_skill_period ON lifecycle_events(collection, skill, occurred_at, event_id);
CREATE INDEX lifecycle_named_period ON lifecycle_events(skill, occurred_at, event_id);
CREATE INDEX lifecycle_attempt ON lifecycle_events(correlation_id, collection, skill);
CREATE INDEX lifecycle_activation ON lifecycle_events(collection, skill, source_key, event_type, occurred_at, event_id);
CREATE TABLE catalog_observations (
sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE REFERENCES usage_events(event_id), collection TEXT NOT NULL,
occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL, source_json TEXT NOT NULL, catalog_sha256 TEXT NOT NULL,
members INTEGER NOT NULL, added INTEGER NOT NULL, changed INTEGER NOT NULL, removed INTEGER NOT NULL);
CREATE INDEX catalog_observation_period ON catalog_observations(occurred_at, sequence);
CREATE INDEX catalog_observation_collection ON catalog_observations(collection, occurred_at);
CREATE TABLE catalog_members (
sequence INTEGER NOT NULL REFERENCES catalog_observations(sequence), skill TEXT NOT NULL, package_path TEXT NOT NULL,
package_sha256 TEXT NOT NULL, metadata_sha256 TEXT NOT NULL, first_seen_at TEXT NOT NULL,
PRIMARY KEY(sequence, skill));
CREATE TABLE catalog_changes (
sequence INTEGER NOT NULL REFERENCES catalog_observations(sequence), skill TEXT NOT NULL, change_type TEXT NOT NULL,
before_json TEXT, after_json TEXT, PRIMARY KEY(sequence, skill));`;

const legacyTables = ['usage_events', 'usage_migrations', 'usage_reads'];
const qualitySql = `CREATE TABLE quality_receipts (
event_id TEXT PRIMARY KEY REFERENCES usage_events(event_id), correlation_id TEXT NOT NULL,
collection TEXT NOT NULL, skill TEXT NOT NULL, source_key TEXT NOT NULL, identity_key TEXT NOT NULL,
source_json TEXT NOT NULL, occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
kind TEXT NOT NULL CHECK(kind IN ('official_validation','behavioral_evaluation')),
assurance TEXT NOT NULL CHECK(assurance IN ('caller_assertion','locally_observed_official_process','verified_retained_benchmark')),
method_name TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('pass','fail','blocked','not-run')));
CREATE INDEX quality_period ON quality_receipts(occurred_at,event_id);
CREATE INDEX quality_collection_period ON quality_receipts(collection,occurred_at,event_id);
CREATE INDEX quality_skill_period ON quality_receipts(collection,skill,occurred_at,event_id);
CREATE INDEX quality_source_period ON quality_receipts(collection,source_key,occurred_at,event_id);
CREATE INDEX quality_identity_period ON quality_receipts(collection,identity_key,occurred_at,event_id);
CREATE INDEX quality_kind_period ON quality_receipts(collection,kind,occurred_at,event_id);`;

const evidenceTables = [
    'catalog_changes',
    'catalog_members',
    'catalog_observations',
    'lifecycle_events',
    'quality_receipts',
    ...legacyTables,
].sort();

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
    {
        version: 3,
        sql: lifecycleSql,
        checksum: createHash('sha256').update(lifecycleSql).digest('hex'),
    },
    {
        version: 4,
        sql: qualitySql,
        checksum: createHash('sha256').update(qualitySql).digest('hex'),
    },
];

/** Serializes schema upgrades while preserving verified migration history. */
export class SkillReadMigration {
    /** Queries never create or upgrade a database; record opens own that transition. */
    verifySkillReads(database: DatabaseSync): void {
        const applied = database
            .prepare('SELECT version, checksum FROM usage_migrations ORDER BY version')
            .all();
        const validPrefix =
            applied.length <= migrations.length &&
            !applied.some(
                (row, index) =>
                    row.version !== migrations[index].version ||
                    row.checksum !== migrations[index].checksum,
            );
        if (validPrefix && applied.length > 0 && applied.length < migrations.length) {
            throw new SkillOperationError('schema_upgrade_required');
        }
        if (!validPrefix || applied.length !== migrations.length)
            throw new Error('Unsupported or altered usage migration');
        const names = database
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .all()
            .map((row) => row.name);
        if (JSON.stringify(names) !== JSON.stringify(evidenceTables)) {
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
            const allowedTables = new Set(evidenceTables);

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
            if (applied.length < 4 && tables.some((table) => table.name === 'quality_receipts')) {
                throw new Error('Untracked quality schema');
            }
            if (
                applied.length < 3 &&
                tables.some((table) => !legacyTables.includes(String(table.name)))
            ) {
                throw new Error('Untracked lifecycle schema');
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

            this.verifySkillReads(database);

            database.exec('COMMIT');
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
    }
}
