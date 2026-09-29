// SPDX-License-Identifier: Apache-2.0
import type { SQLInputValue } from 'node:sqlite';
import { SkillEvidenceDatabaseRepository } from './SkillEvidenceDatabaseRepository.ts';
import { SkillEvidenceEventRepository } from './SkillEvidenceEventRepository.ts';
import {
    SkillEvidenceValidator,
    lifecycleTypes,
    sourceKey,
    identityKey,
} from '../validator/SkillEvidenceValidator.ts';
import type {
    EvidenceQuery,
    LifecycleEvent,
    LifecycleType,
    PackageEvidenceSource,
} from '../validator/SkillEvidenceValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

export const MAX_PERIOD_EVENTS = 5000;
type LifecycleRow = {
    event_id: string;
    correlation_id: string;
    collection: string;
    skill: string;
    source_key: string;
    identity_key: string;
    source_json: string;
    session: string;
    occurred_at: string;
    event_type: LifecycleType;
    reason: string | null;
};
const stage = (type: LifecycleType): number =>
    type === 'skill.routed' ? 0 : type === 'skill.activated' ? 1 : 2;
const attemptKey = (row: LifecycleRow): string =>
    JSON.stringify([row.correlation_id, row.collection, row.skill]);
const ratio = (numerator: number, denominator: number) => ({
    numerator,
    denominator,
    rate: denominator ? numerator / denominator : null,
});

/** Explicit attempt evidence and bounded cohort projections, independent of reads. */
export class SkillLifecycleRepository {
    private readonly connection: SkillEvidenceDatabaseRepository;
    constructor(connection: SkillEvidenceDatabaseRepository) {
        this.connection = connection;
    }

    record(value: unknown) {
        const event = new SkillEvidenceValidator().lifecycle(value);
        const database = this.connection.database;
        return this.connection.transaction(() => {
            const recorded = new SkillEvidenceEventRepository(database).claim(event);
            if (!recorded)
                return { recorded, event_id: event.event_id, event_type: event.event_type };
            const session = database
                .prepare(
                    'SELECT session FROM lifecycle_events INDEXED BY lifecycle_attempt WHERE correlation_id=? LIMIT 1',
                )
                .get(event.correlation_id);
            if (session && session.session !== event.session) this.conflict();
            const previous = database
                .prepare(
                    'SELECT * FROM lifecycle_events INDEXED BY lifecycle_attempt WHERE correlation_id=? AND collection=? AND skill=? LIMIT 4',
                )
                .all(
                    event.correlation_id,
                    event.payload.collection,
                    event.payload.skill,
                ) as unknown as LifecycleRow[];
            const identity = identityKey(event.payload.source);
            for (const row of previous) {
                if (
                    row.identity_key !== identity ||
                    row.session !== event.session ||
                    stage(row.event_type) === stage(event.event_type)
                )
                    this.conflict();
                const before = stage(row.event_type) < stage(event.event_type);
                if (
                    before
                        ? row.occurred_at > event.occurred_at
                        : row.occurred_at < event.occurred_at
                )
                    this.conflict();
            }
            database
                .prepare(`INSERT INTO lifecycle_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(
                    event.event_id,
                    event.correlation_id,
                    event.payload.collection,
                    event.payload.skill,
                    sourceKey(event.payload.source),
                    identity,
                    JSON.stringify(event.payload.source),
                    event.session,
                    event.occurred_at,
                    new Date().toISOString(),
                    event.event_type,
                    event.payload.reason,
                );
            return { recorded: true, event_id: event.event_id, event_type: event.event_type };
        });
    }

    metrics(value: unknown) {
        const query = new SkillEvidenceValidator().query(value, 'lifecycle');
        return this.connection.snapshot(() => this.projectMetrics(query));
    }

    overlap(value: unknown) {
        const query = new SkillEvidenceValidator().query(value, 'overlap');
        return this.connection.snapshot(() => {
            const events = this.periodRows({ ...query, skill: undefined }, 'skill.routed');
            const decisions = new Map<
                string,
                Map<string, { collection: string; skill: string; source_key: string }>
            >();
            const participation = new Map<string, Set<string>>();
            for (const row of events) {
                const key = JSON.stringify([row.collection, row.skill, row.source_key]);
                const members = decisions.get(row.correlation_id) ?? new Map();
                members.set(key, {
                    collection: row.collection,
                    skill: row.skill,
                    source_key: row.source_key,
                });
                decisions.set(row.correlation_id, members);
                const routed = participation.get(key) ?? new Set();
                routed.add(row.correlation_id);
                participation.set(key, routed);
            }
            const pairs = new Map<
                string,
                {
                    left: { collection: string; skill: string; source_key: string };
                    right: { collection: string; skill: string; source_key: string };
                    joint_decisions: number;
                    union_decisions: number;
                }
            >();
            let work = 0;
            for (const members of decisions.values()) {
                const keys = [...members.keys()].sort();
                for (let left = 0; left < keys.length; left += 1)
                    for (let right = left + 1; right < keys.length; right += 1) {
                        if (++work > 100000) throw new SkillOperationError('query_limit_exceeded');
                        const first = members.get(keys[left])!,
                            second = members.get(keys[right])!;
                        if (
                            query.skill &&
                            first.skill !== query.skill &&
                            second.skill !== query.skill
                        )
                            continue;
                        const key = JSON.stringify([keys[left], keys[right]]);
                        const pair = pairs.get(key) ?? {
                            left: first,
                            right: second,
                            joint_decisions: 0,
                            union_decisions: 0,
                        };
                        pair.joint_decisions += 1;
                        pair.union_decisions =
                            participation.get(keys[left])!.size +
                            participation.get(keys[right])!.size -
                            pair.joint_decisions;
                        pairs.set(key, pair);
                    }
            }
            const rows = [...pairs.values()].sort(
                (a, b) =>
                    b.joint_decisions - a.joint_decisions ||
                    JSON.stringify(a.left).localeCompare(JSON.stringify(b.left)) ||
                    JSON.stringify(a.right).localeCompare(JSON.stringify(b.right)),
            );
            return {
                from: query.from,
                until: query.until,
                basis: 'explicit_co_routing',
                truncated: rows.length > query.limit,
                rows: rows.slice(0, query.limit).map((row) => ({
                    ...row,
                    overlap: ratio(row.joint_decisions, row.union_decisions),
                })),
            };
        });
    }

    private periodRows(query: EvidenceQuery, type?: LifecycleType): LifecycleRow[] {
        const clauses = ['occurred_at>=?', 'occurred_at<?'];
        const args: SQLInputValue[] = [query.from, query.until];
        if (query.collection) {
            clauses.push('collection=?');
            args.push(query.collection);
        }
        if (query.skill) {
            clauses.push('skill=?');
            args.push(query.skill);
        }
        const index = query.collection
            ? query.skill
                ? 'lifecycle_skill_period'
                : 'lifecycle_collection_period'
            : query.skill
              ? 'lifecycle_named_period'
              : 'lifecycle_period';
        // Each index has only equality prefixes before the bounded time range.
        // Apply the stage filter after the cap so sparse stages cannot hide a scan.
        const rows = this.connection.database
            .prepare(
                `SELECT * FROM lifecycle_events INDEXED BY ${index} WHERE ${clauses.join(' AND ')} ORDER BY occurred_at, event_id LIMIT ?`,
            )
            .all(...args, MAX_PERIOD_EVENTS + 1) as unknown as LifecycleRow[];
        if (rows.length > MAX_PERIOD_EVENTS) throw new SkillOperationError('query_limit_exceeded');
        return type ? rows.filter((row) => row.event_type === type) : rows;
    }

    private projectMetrics(query: EvidenceQuery) {
        const database = this.connection.database;
        const period = this.periodRows(query);
        const attempts = new Map<string, LifecycleRow[]>();
        // LIMIT bounds returned rows, not work. Seek by the full attempt key;
        // a period index could otherwise scan all older events for this skill.
        for (const row of period) {
            const key = attemptKey(row);
            if (!attempts.has(key))
                attempts.set(
                    key,
                    database
                        .prepare(
                            'SELECT * FROM lifecycle_events INDEXED BY lifecycle_attempt WHERE correlation_id=? AND collection=? AND skill=? AND occurred_at<? LIMIT 4',
                        )
                        .all(
                            row.correlation_id,
                            row.collection,
                            row.skill,
                            query.until,
                        ) as unknown as LifecycleRow[],
                );
        }
        type Metric = {
            period: string;
            collection: string;
            skill: string;
            source_key: string;
            identity_key: string;
            source: PackageEvidenceSource;
            attempts: Set<string>;
            event_counts: Record<LifecycleType, number>;
            routed_attempts: number;
            activated_attempts: number;
            converted_routes: number;
            completed_activations: number;
            blocked_activations: number;
            pre_activation_blocks: number;
            unmatched_activations: number;
            unmatched_outcomes: number;
            reactivations: number;
            revision_changes: number;
            reasons: Record<string, number>;
        };
        const grouped = new Map<string, Metric>();
        const group = (row: LifecycleRow): Metric => {
            const bucket =
                query.interval === 'total'
                    ? 'total'
                    : row.occurred_at.slice(0, query.interval === 'day' ? 10 : 7);
            const key = JSON.stringify([bucket, row.collection, row.skill, row.identity_key]);
            let result = grouped.get(key);
            if (!result) {
                result = {
                    period: bucket,
                    collection: row.collection,
                    skill: row.skill,
                    source_key: row.source_key,
                    identity_key: row.identity_key,
                    source: JSON.parse(row.source_json),
                    attempts: new Set(),
                    event_counts: Object.fromEntries(
                        lifecycleTypes.map((type) => [type, 0]),
                    ) as Record<LifecycleType, number>,
                    routed_attempts: 0,
                    activated_attempts: 0,
                    converted_routes: 0,
                    completed_activations: 0,
                    blocked_activations: 0,
                    pre_activation_blocks: 0,
                    unmatched_activations: 0,
                    unmatched_outcomes: 0,
                    reactivations: 0,
                    revision_changes: 0,
                    reasons: {},
                };
                grouped.set(key, result);
            }
            return result;
        };
        for (const row of period) {
            const metric = group(row);
            metric.attempts.add(attemptKey(row));
            metric.event_counts[row.event_type] += 1;
            if (row.reason) metric.reasons[row.reason] = (metric.reasons[row.reason] ?? 0) + 1;
            const events = attempts.get(attemptKey(row))!;
            const route = events.find((event) => event.event_type === 'skill.routed');
            const activation = events.find((event) => event.event_type === 'skill.activated');
            const terminal = events.find((event) => stage(event.event_type) === 2);
            if (row.event_type === 'skill.routed') {
                metric.routed_attempts += 1;
                if (activation) metric.converted_routes += 1;
            }
            if (row.event_type === 'skill.activated') {
                metric.activated_attempts += 1;
                if (!route) metric.unmatched_activations += 1;
                if (terminal?.event_type === 'skill.completed') metric.completed_activations += 1;
                if (terminal?.event_type === 'skill.blocked') metric.blocked_activations += 1;
                const previous = database
                    .prepare(
                        "SELECT identity_key FROM lifecycle_events INDEXED BY lifecycle_activation WHERE collection=? AND skill=? AND source_key=? AND event_type='skill.activated' AND occurred_at<? ORDER BY occurred_at DESC, event_id DESC LIMIT 1",
                    )
                    .get(row.collection, row.skill, row.source_key, row.occurred_at);
                if (previous) {
                    metric.reactivations += 1;
                    if (previous.identity_key !== row.identity_key) metric.revision_changes += 1;
                }
            }
            if (stage(row.event_type) === 2 && !activation) {
                metric.unmatched_outcomes += 1;
                if (row.event_type === 'skill.blocked') metric.pre_activation_blocks += 1;
            }
        }
        const rows = [...grouped.values()].sort(
            (a, b) =>
                b.period.localeCompare(a.period) ||
                b.activated_attempts - a.activated_attempts ||
                a.collection.localeCompare(b.collection) ||
                a.skill.localeCompare(b.skill) ||
                a.identity_key.localeCompare(b.identity_key),
        );
        return {
            from: query.from,
            until: query.until,
            interval: query.interval,
            basis: 'explicit_caller_evidence',
            truncated: rows.length > query.limit,
            rows: rows.slice(0, query.limit).map((row) => ({
                ...row,
                attempts: row.attempts.size,
                route_conversion: ratio(row.converted_routes, row.routed_attempts),
                completion_rate: ratio(row.completed_activations, row.activated_attempts),
                block_rate: ratio(row.blocked_activations, row.activated_attempts),
            })),
        };
    }

    private conflict(): never {
        throw new SkillOperationError('evidence_conflict');
    }
}
