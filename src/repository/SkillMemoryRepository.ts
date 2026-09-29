// SPDX-License-Identifier: Apache-2.0
import type { SQLInputValue } from 'node:sqlite';
import { SkillEvidenceDatabaseRepository } from './SkillEvidenceDatabaseRepository.ts';
import { SkillLifecycleRepository } from './SkillLifecycleRepository.ts';
import { CatalogObservationRepository } from './CatalogObservationRepository.ts';
import { lifecycleTypes } from '../validator/SkillEvidenceValidator.ts';
import type { EvidenceSource, PackageEvidenceSource } from '../validator/SkillEvidenceValidator.ts';
import { SkillReadValidator } from '../validator/SkillReadValidator.ts';
import type { SkillRead } from '../validator/SkillReadValidator.ts';
import { SkillTelemetryValidator } from '../validator/SkillTelemetryValidator.ts';
import {
    MEMORY_INPUT_BYTES,
    MEMORY_OUTPUT_BYTES,
    MEMORY_PERIOD_ROWS,
    SkillMemoryValidator,
} from '../validator/SkillMemoryValidator.ts';
import type { SkillMemoryQuery } from '../validator/SkillMemoryValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

type LifecycleRow = {
    skill: string;
    source_key: string;
    identity_key: string;
    event_type: (typeof lifecycleTypes)[number];
    occurred_at: string;
};
type Occurrence = { family: string; occurred_at: string };
type CatalogRow = { sequence: number; occurred_at: string };

/** Bounded projections over existing aggregates; no additional memory persistence. */
export class SkillMemoryRepository {
    private readonly connection: SkillEvidenceDatabaseRepository;
    private readonly validator = new SkillMemoryValidator();

    constructor(connection: SkillEvidenceDatabaseRepository) {
        this.connection = connection;
    }

    summarize(value: unknown) {
        const query = this.validator.query(value, 'summarize');
        return this.connection.snapshot(() => {
            const lifecycle = new SkillLifecycleRepository(this.connection).projectMetrics(query);
            const catalog = new CatalogObservationRepository(this.connection);
            const history = catalog.projectHistory(query);
            const inactivity = this.inactivity(catalog, query);
            const reads = this.readSummary(query);
            const collisions = this.sourceCollisions(this.lifecycleRows(query), query.limit);
            return this.validator.response({
                ...this.context(query),
                operation: 'summarize',
                basis: 'recorded_evidence_only',
                truncated:
                    lifecycle.truncated ||
                    history.truncated ||
                    inactivity.truncated ||
                    reads.truncated ||
                    collisions.truncated,
                lifecycle: {
                    ...lifecycle,
                    identity_tier: 'source_qualified_caller_assertion',
                    rows: lifecycle.rows.map((row) => ({
                        ...row,
                        source: this.packageSource(row.source),
                    })),
                },
                lifecycle_source_collisions: collisions,
                read_observations: reads,
                catalog_history: {
                    ...history,
                    delta_counts_scope: 'complete_collection_observation',
                    observation_scope: query.skill
                        ? 'observations_that_changed_selected_skill'
                        : 'collection',
                    observations: history.observations!.map((row) => ({
                        sequence: row.sequence,
                        collection: row.collection,
                        occurred_at: row.occurred_at,
                        source: this.source(row.source),
                        catalog_sha256: row.catalog_sha256,
                        members: row.members,
                        added: row.added,
                        changed: row.changed,
                        removed: row.removed,
                    })),
                },
                catalog_inactivity: inactivity,
                receipt_schemas: {
                    approved_decisions: 'not_recorded',
                    official_validation: 'not_recorded',
                    known_limitations: 'not_recorded',
                    approved_migrations: 'not_recorded',
                },
                limits_of_inference: {
                    reads_are_activations: false,
                    caller_reason_is_validation_receipt: false,
                    catalog_change_is_approved_migration: false,
                    provenance_verified: false,
                    outside_window_history: 'unassessed',
                    supporting_context: 'bounded_attempt_and_catalog_probes_may_precede_window',
                },
            });
        });
    }

    retention(value: unknown) {
        const query = this.validator.query(value, 'retention');
        return this.connection.snapshot(() => {
            const occurrences: Occurrence[] = [
                ...this.lifecycleRows(query).map((row) => ({
                    family: row.event_type,
                    occurred_at: row.occurred_at,
                })),
                ...this.catalogRows(query).map((row) => ({
                    family: 'catalog.observed',
                    occurred_at: row.occurred_at,
                })),
                ...this.readRows(query).map((row) => ({
                    family: 'read_observations',
                    occurred_at: row.occurred_at,
                })),
                ...this.readAttempts(query),
            ];
            const families = [
                ...lifecycleTypes,
                'catalog.observed',
                'read_observations',
                'skill.read.attempted',
            ].sort();
            return this.validator.response({
                ...this.context(query),
                operation: 'retention',
                basis: 'logical_occurrences_not_physical_table_rows',
                policy: {
                    status: query.cutoff ? 'inspected' : 'policy_not_supplied',
                    cutoff: query.cutoff ?? null,
                    basis: 'caller_supplied_event_time_cutoff',
                    persisted: false,
                    deletion_authorized: false,
                },
                ...this.partition(occurrences, query.cutoff),
                families: {
                    count: families.length,
                    truncated: families.length > query.limit,
                    rows: families.slice(0, query.limit).map((family) => ({
                        family,
                        ...this.partition(
                            occurrences.filter((row) => row.family === family),
                            query.cutoff,
                        ),
                    })),
                },
                coverage: {
                    outside_window_history: 'unassessed',
                    catalog_scope: query.skill
                        ? 'observations_with_member_or_change_for_selected_skill'
                        : 'collection',
                    mirrored_envelopes: 'not_counted_again',
                    session_events: 'unscoped_not_attributed',
                    retention_dependencies:
                        'unassessed_attempt_closure_catalog_baselines_deltas_and_shared_sessions',
                    deletion_eligibility: 'not_assessed',
                },
            });
        });
    }

    private context(query: SkillMemoryQuery) {
        return {
            schema_version: 1,
            scope: {
                collection: query.collection,
                skill: query.skill ?? null,
                from: query.from,
                until: query.until,
            },
            consistency: 'single_read_only_snapshot',
            limits: {
                input_bytes: MEMORY_INPUT_BYTES,
                period_rows_per_scan: MEMORY_PERIOD_ROWS,
                entries_per_section: query.limit,
                output_bytes: MEMORY_OUTPUT_BYTES,
                catalog_members: 256,
                legacy_scan_scope: 'entire_database_window_before_collection_or_skill_filter',
            },
        };
    }

    private lifecycleRows(query: SkillMemoryQuery): LifecycleRow[] {
        const conditions = ['collection=?', 'occurred_at>=?', 'occurred_at<?'];
        const args: SQLInputValue[] = [query.collection, query.from, query.until];
        if (query.skill) {
            conditions.push('skill=?');
            args.push(query.skill);
        }
        const index = query.skill ? 'lifecycle_skill_period' : 'lifecycle_collection_period';
        const rows = this.connection.database
            .prepare(
                `SELECT skill,source_key,identity_key,event_type,occurred_at FROM lifecycle_events INDEXED BY ${index} WHERE ${conditions.join(' AND ')} ORDER BY occurred_at,event_id LIMIT ?`,
            )
            .all(...args, MEMORY_PERIOD_ROWS + 1) as unknown as LifecycleRow[];
        this.bound(rows);
        return rows;
    }

    private catalogRows(query: SkillMemoryQuery): CatalogRow[] {
        const rows = this.connection.database
            .prepare(
                'SELECT sequence,occurred_at FROM catalog_observations INDEXED BY catalog_observation_collection WHERE collection=? AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at LIMIT ?',
            )
            .all(
                query.collection,
                query.from,
                query.until,
                MEMORY_PERIOD_ROWS + 1,
            ) as unknown as CatalogRow[];
        this.bound(rows);
        if (!query.skill) return rows;
        const member = this.connection.database.prepare(
            'SELECT 1 FROM catalog_members WHERE sequence=? AND skill=?',
        );
        const changed = this.connection.database.prepare(
            'SELECT 1 FROM catalog_changes WHERE sequence=? AND skill=?',
        );
        return rows.filter(
            (row) =>
                member.get(row.sequence, query.skill!) || changed.get(row.sequence, query.skill!),
        );
    }

    private readRows(query: SkillMemoryQuery): SkillRead[] {
        // The legacy index has no collection prefix. Cap its full time range first.
        const rows = this.connection.database
            .prepare(
                'SELECT event_id,collection,skill,revision,session,occurred_at FROM usage_reads INDEXED BY usage_period WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at LIMIT ?',
            )
            .all(query.from, query.until, MEMORY_PERIOD_ROWS + 1) as unknown as SkillRead[];
        this.bound(rows);
        return rows
            .filter(
                (row) =>
                    row.collection === query.collection &&
                    (!query.skill || row.skill === query.skill),
            )
            .map((row) => new SkillReadValidator().skillRead(row));
    }

    private readSummary(query: SkillMemoryQuery) {
        const reads = this.readRows(query);
        const groups = new Map<
            string,
            {
                collection: string;
                skill: string;
                revision: string;
                reads: number;
                sessions: Set<string>;
            }
        >();
        for (const row of reads) {
            const key = JSON.stringify([row.collection, row.skill, row.revision]);
            const group = groups.get(key) ?? {
                collection: row.collection,
                skill: row.skill,
                revision: row.revision,
                reads: 0,
                sessions: new Set<string>(),
            };
            group.reads += 1;
            group.sessions.add(row.session);
            groups.set(key, group);
        }
        const rows = [...groups.values()].sort(
            (left, right) =>
                left.skill.localeCompare(right.skill, 'en') ||
                left.revision.localeCompare(right.revision, 'en'),
        );
        return {
            identity_tier: 'name_and_revision_only',
            source_attribution: 'unavailable',
            reads: reads.length,
            groups: rows.length,
            truncated: rows.length > query.limit,
            rows: rows
                .slice(0, query.limit)
                .map((row) => ({ ...row, sessions: row.sessions.size })),
        };
    }

    private sourceCollisions(rows: LifecycleRow[], limit: number) {
        const groups = new Map<string, { sources: Set<string>; identities: Set<string> }>();
        for (const row of rows) {
            const group = groups.get(row.skill) ?? {
                sources: new Set<string>(),
                identities: new Set<string>(),
            };
            group.sources.add(row.source_key);
            group.identities.add(row.identity_key);
            groups.set(row.skill, group);
        }
        const collisions = [...groups.entries()]
            .filter(([, group]) => group.sources.size > 1)
            .sort(([left], [right]) => left.localeCompare(right, 'en'));
        return {
            basis: 'distinct_recorded_sources_for_one_name_in_window',
            skills: collisions.length,
            identities: new Set(rows.map((row) => row.identity_key)).size,
            truncated: collisions.length > limit,
            rows: collisions.slice(0, limit).map(([skill, group]) => ({
                skill,
                sources: group.sources.size,
                identities: group.identities.size,
            })),
        };
    }

    private inactivity(catalog: CatalogObservationRepository, query: SkillMemoryQuery) {
        try {
            const result = catalog.projectInactivity(query);
            return {
                ...result,
                status: 'observed',
                rows: result.rows.map(({ observation_id: _id, ...row }) => ({
                    ...row,
                    source: this.packageSource(row.source),
                })),
            };
        } catch (error) {
            if (!(error instanceof SkillOperationError) || error.code !== 'catalog_unobserved')
                throw error;
            return {
                status: 'catalog_unobserved',
                observed_collections: 0,
                truncated: false,
                rows: [],
            };
        }
    }

    private readAttempts(query: SkillMemoryQuery): Occurrence[] {
        // Include all event headers in the cap before selecting sparse legacy attempts.
        const rows = this.connection.database
            .prepare(
                'SELECT event_id,event_type,occurred_at FROM usage_events INDEXED BY usage_events_period WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at LIMIT ?',
            )
            .all(query.from, query.until, MEMORY_PERIOD_ROWS + 1);
        this.bound(rows);
        const envelope = this.connection.database.prepare(
            'SELECT envelope FROM usage_events WHERE event_id=? AND length(CAST(envelope AS BLOB))<=8192',
        );
        const attempts: Occurrence[] = [];
        for (const row of rows) {
            if (row.event_type !== 'skill.read.attempted') continue;
            const stored = envelope.get(row.event_id);
            if (!stored) throw new SkillOperationError('storage_unavailable');
            const event = new SkillTelemetryValidator().event(JSON.parse(String(stored.envelope)));
            if (
                event.event_type !== row.event_type ||
                event.event_id !== row.event_id ||
                event.occurred_at !== row.occurred_at
            )
                throw new SkillOperationError('storage_unavailable');
            if (
                event.payload.collection !== query.collection ||
                (query.skill && event.payload.skill !== query.skill)
            )
                continue;
            attempts.push({ family: event.event_type, occurred_at: event.occurred_at });
        }
        return attempts;
    }

    private partition(rows: Occurrence[], cutoff?: string) {
        return {
            total: this.count(rows),
            before_cutoff: cutoff
                ? this.count(rows.filter((row) => row.occurred_at < cutoff))
                : null,
            at_or_after_cutoff: cutoff
                ? this.count(rows.filter((row) => row.occurred_at >= cutoff))
                : null,
        };
    }

    private count(rows: Occurrence[]) {
        let first: string | null = null;
        let last: string | null = null;
        for (const row of rows) {
            if (first === null || row.occurred_at < first) first = row.occurred_at;
            if (last === null || row.occurred_at > last) last = row.occurred_at;
        }
        return { count: rows.length, first_occurred_at: first, last_occurred_at: last };
    }

    private bound(rows: unknown[]): void {
        if (rows.length > MEMORY_PERIOD_ROWS) throw new SkillOperationError('query_limit_exceeded');
    }

    private source(value: EvidenceSource): EvidenceSource {
        return {
            repository: value.repository,
            source_ref: value.source_ref,
            resolved_git_sha: value.resolved_git_sha,
        };
    }

    private packageSource(value: PackageEvidenceSource): PackageEvidenceSource {
        return {
            ...this.source(value),
            package_path: value.package_path,
            package_sha256: value.package_sha256,
        };
    }
}
