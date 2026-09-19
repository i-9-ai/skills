// SPDX-License-Identifier: Apache-2.0
import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, lstatSync, openSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { SkillReadMigration } from '../migration/SkillReadMigration.ts';
import { readFields, SkillReadValidator } from '../validator/SkillReadValidator.ts';

/** Persists observed reads; rankings are projections of this event aggregate. */
export class SkillReadRepository {
    private readonly database: DatabaseSync;
    private closed = false;
    private readonly validator = new SkillReadValidator();

    constructor(filename: string) {
        if (!isAbsolute(filename)) throw new Error('Database path must be absolute');
        if (realpathSync(dirname(filename)) !== dirname(filename))
            throw new Error('Database parent must be canonical');

        try {
            closeSync(
                openSync(
                    filename,
                    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
                    0o600,
                ),
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }

        const info = lstatSync(filename);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
            throw new Error('Expected regular database file');

        this.database = new DatabaseSync(filename);

        try {
            new SkillReadMigration().migrateSkillReads(this.database);
        } catch (error) {
            this.close();
            throw error;
        }
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.database.close();
    }

    record(value: unknown): { recorded: boolean; event_type: 'read' } {
        const event = this.validator.skillRead(value);
        this.database.exec('BEGIN IMMEDIATE');

        try {
            const existing = this.database
                .prepare('SELECT * FROM usage_reads WHERE event_id=?')
                .get(event.event_id);
            if (existing && readFields.some((field) => existing[field] !== event[field])) {
                throw new Error('Event ID already has different evidence');
            }

            if (!existing) {
                this.database
                    .prepare('INSERT INTO usage_reads VALUES (?, ?, ?, ?, ?, ?)')
                    .run(...readFields.map((field) => event[field]));
            }

            this.database.exec('COMMIT');
            return { recorded: !existing, event_type: 'read' };
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }

    rank(value: unknown = {}) {
        const { from, until, limit } = this.validator.rankingQuery(value);
        const rows = this.database
            .prepare(
                `
      SELECT collection, skill, COUNT(*) AS reads, COUNT(DISTINCT session) AS sessions
      FROM usage_reads
      WHERE occurred_at >= ? AND occurred_at < ?
      GROUP BY collection, skill
      ORDER BY reads DESC, collection, skill
      LIMIT ?
    `,
            )
            .all(from, until, limit);

        return { event_type: 'read', from, until, rows };
    }
}
