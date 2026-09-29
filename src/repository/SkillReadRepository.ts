// SPDX-License-Identifier: Apache-2.0
import { DatabaseSync } from 'node:sqlite';
import { SkillEvidenceDatabaseRepository } from './SkillEvidenceDatabaseRepository.ts';
import { readFields, SkillReadValidator } from '../validator/SkillReadValidator.ts';
import { SkillTelemetryValidator } from '../validator/SkillTelemetryValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

/** Persists observed reads; rankings are projections of this event aggregate. */
export class SkillReadRepository {
    private readonly database: DatabaseSync;
    private readonly connection: SkillEvidenceDatabaseRepository;
    private readonly validator = new SkillReadValidator();

    constructor(filename: string, { readOnly = false } = {}) {
        this.connection = new SkillEvidenceDatabaseRepository(filename, { readOnly });
        this.database = this.connection.database;
    }

    close(): void {
        this.connection.close();
    }

    record(value: unknown): { recorded: boolean; event_type: 'read' } {
        const event = this.validator.skillRead(value);
        this.database.exec('BEGIN IMMEDIATE');

        try {
            if (
                this.database
                    .prepare('SELECT event_id FROM usage_events WHERE event_id=?')
                    .get(event.event_id)
            ) {
                throw new SkillOperationError('evidence_conflict');
            }
            const existing = this.database
                .prepare('SELECT * FROM usage_reads WHERE event_id=?')
                .get(event.event_id);
            if (existing && readFields.some((field) => existing[field] !== event[field])) {
                throw new SkillOperationError('evidence_conflict');
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

    /** Atomically retain a typed event and project only successful observations. */
    recordEvent(value: unknown, { preserveFirstReceipt = false } = {}) {
        const event = new SkillTelemetryValidator().event(value);
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const previous = this.database
                .prepare('SELECT envelope FROM usage_events WHERE event_id=?')
                .get(event.event_id);
            // Hosts without event timestamps use the first successful local receipt.
            // Only the verified host service opts into this; explicit CLI evidence
            // keeps its supplied timestamp and exact conflict semantics.
            if (previous && preserveFirstReceipt) {
                event.occurred_at = JSON.parse(String(previous.envelope)).occurred_at;
            }
            const envelope = JSON.stringify(event);
            if (previous && previous.envelope !== envelope)
                throw new SkillOperationError('evidence_conflict');
            if (previous) {
                this.database.exec('COMMIT');
                return { recorded: false, event_id: event.event_id, event_type: event.event_type };
            }
            if (
                this.database
                    .prepare('SELECT event_id FROM usage_reads WHERE event_id=?')
                    .get(event.event_id)
            ) {
                throw new SkillOperationError('evidence_conflict');
            }
            this.database
                .prepare('INSERT INTO usage_events VALUES (?, ?, ?, ?, ?)')
                .run(event.event_id, event.event_type, event.occurred_at, event.session, envelope);
            if (event.event_type === 'skill.read.observed') {
                this.database
                    .prepare('INSERT INTO usage_reads VALUES (?, ?, ?, ?, ?, ?)')
                    .run(
                        event.event_id,
                        event.payload.collection!,
                        event.payload.skill!,
                        event.payload.revision!,
                        event.session,
                        event.occurred_at,
                    );
            }
            this.database.exec('COMMIT');
            return { recorded: true, event_id: event.event_id, event_type: event.event_type };
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }

    /** UTC buckets distinguish explicit starts, read attempts and successful reads. */
    trends(value: unknown = {}) {
        const { from, until, interval, limit } = new SkillTelemetryValidator().trends(value);
        const width = interval === 'day' ? 10 : 7;
        const rows = this.database
            .prepare(
                `
            SELECT period, SUM(reads) AS reads, SUM(read_sessions) AS read_sessions,
                SUM(attempts) AS attempts, SUM(session_starts) AS session_starts,
                SUM(started_sessions) AS started_sessions
            FROM (
                SELECT substr(occurred_at, 1, ?) AS period, COUNT(*) AS reads,
                    COUNT(DISTINCT session) AS read_sessions, 0 AS attempts,
                    0 AS session_starts, 0 AS started_sessions
                FROM usage_reads WHERE occurred_at >= ? AND occurred_at < ? GROUP BY period
                UNION ALL
                SELECT substr(occurred_at, 1, ?) AS period, 0, 0,
                    SUM(event_type='skill.read.attempted'), SUM(event_type='session.started'),
                    COUNT(DISTINCT CASE WHEN event_type='session.started' THEN session END)
                FROM usage_events WHERE occurred_at >= ? AND occurred_at < ? GROUP BY period
            ) GROUP BY period ORDER BY period DESC LIMIT ?
        `,
            )
            .all(width, from, until, width, from, until, limit + 1);
        return {
            from,
            until,
            interval,
            truncated: rows.length > limit,
            rows: rows.slice(0, limit),
        };
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
