// SPDX-License-Identifier: Apache-2.0
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

// Independent issued bytes, not imported/read from the current migration implementation.
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

export const issuedSql = [initialSql, telemetrySql, lifecycleSql];
export const issuedChecksums = [
    '1ba72ecd68d789c51d40273debd3bf44201cc668225f1f7e4188bbe6e914f836',
    '135cd6d9c7f255e209d4290498db19f7c31173e63eaac097437e0160bec41447',
    '6699a82f2f6efe65f8e99824e70ca746ba779769a2065eb21cf61fac471c71a9',
];
export function createIssuedDatabase(filename, version = 3) {
    const database = new DatabaseSync(filename);
    database.exec(
        'CREATE TABLE usage_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)',
    );
    for (let index = 0; index < version; index += 1) {
        const actual = createHash('sha256').update(issuedSql[index]).digest('hex');
        if (actual !== issuedChecksums[index]) throw new Error('Issued fixture bytes altered');
        database.exec(issuedSql[index]);
        database.prepare('INSERT INTO usage_migrations VALUES(?,?)').run(index + 1, actual);
    }
    return database;
}
export function verifyIssuedConsumer(database) {
    const applied = database
        .prepare('SELECT version,checksum FROM usage_migrations ORDER BY version')
        .all();
    if (
        applied.length !== 3 ||
        applied.some(
            (row, index) => row.version !== index + 1 || row.checksum !== issuedChecksums[index],
        )
    )
        throw new Error('Unsupported or altered usage migration');
}
