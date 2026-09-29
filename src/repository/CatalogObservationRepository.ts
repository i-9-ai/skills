// SPDX-License-Identifier: Apache-2.0
import type { SQLInputValue } from 'node:sqlite';
import { SkillEvidenceDatabaseRepository } from './SkillEvidenceDatabaseRepository.ts';
import { SkillEvidenceEventRepository } from './SkillEvidenceEventRepository.ts';
import {
    SkillEvidenceValidator,
    sourceKey,
    identityKey,
} from '../validator/SkillEvidenceValidator.ts';
import type {
    CatalogMember,
    EvidenceSource,
    EvidenceQuery,
} from '../validator/SkillEvidenceValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

type Header = {
    sequence: number;
    event_id: string;
    collection: string;
    occurred_at: string;
    recorded_at: string;
    source_json: string;
    catalog_sha256: string;
    members: number;
    added: number;
    changed: number;
    removed: number;
};
type MemberRow = CatalogMember & { first_seen_at: string };
const memberEvidence = (member: CatalogMember, source: EvidenceSource) => ({
    skill: member.skill,
    source: { ...source, package_path: member.package_path, package_sha256: member.package_sha256 },
    metadata_sha256: member.metadata_sha256,
});

/** Complete redacted observations and deltas in the dedicated evidence store. */
export class CatalogObservationRepository {
    private readonly connection: SkillEvidenceDatabaseRepository;
    constructor(connection: SkillEvidenceDatabaseRepository) {
        this.connection = connection;
    }

    record(value: unknown) {
        const event = new SkillEvidenceValidator().catalog(value);
        const database = this.connection.database;
        return this.connection.transaction(() => {
            const recorded = new SkillEvidenceEventRepository(database).claim(event);
            if (!recorded) {
                const previous = database
                    .prepare('SELECT sequence FROM catalog_observations WHERE event_id=?')
                    .get(event.event_id);
                if (!previous) throw new SkillOperationError('storage_unavailable');
                return {
                    recorded: false,
                    event_id: event.event_id,
                    event_type: event.event_type,
                    sequence: Number(previous.sequence),
                };
            }
            const latest = database
                .prepare(
                    'SELECT * FROM catalog_observations WHERE collection=? ORDER BY occurred_at DESC LIMIT 1',
                )
                .get(event.payload.collection) as Header | undefined;
            if (latest && latest.occurred_at >= event.occurred_at)
                throw new SkillOperationError('evidence_conflict');
            const before = latest ? this.members(latest.sequence) : [];
            const previous = new Map(before.map((member) => [member.skill, member]));
            const current = new Map(event.payload.skills.map((member) => [member.skill, member]));
            const previousSource: EvidenceSource | undefined = latest
                ? JSON.parse(latest.source_json)
                : undefined;
            const changes = [...new Set([...previous.keys(), ...current.keys()])]
                .sort()
                .flatMap((skill) => {
                    const old = previous.get(skill),
                        next = current.get(skill);
                    const before = old ? memberEvidence(old, previousSource!) : null;
                    const after = next ? memberEvidence(next, event.payload.source) : null;
                    if (JSON.stringify(before) === JSON.stringify(after)) return [];
                    return [
                        {
                            skill,
                            change_type: !before ? 'added' : !after ? 'removed' : 'changed',
                            before,
                            after,
                        },
                    ];
                });
            const counts = { added: 0, changed: 0, removed: 0 };
            for (const change of changes) counts[change.change_type as keyof typeof counts] += 1;
            const result = database
                .prepare(
                    'INSERT INTO catalog_observations(event_id,collection,occurred_at,recorded_at,source_json,catalog_sha256,members,added,changed,removed) VALUES (?,?,?,?,?,?,?,?,?,?)',
                )
                .run(
                    event.event_id,
                    event.payload.collection,
                    event.occurred_at,
                    new Date().toISOString(),
                    JSON.stringify(event.payload.source),
                    event.payload.catalog_sha256,
                    current.size,
                    counts.added,
                    counts.changed,
                    counts.removed,
                );
            const sequence = Number(result.lastInsertRowid);
            const putMember = database.prepare('INSERT INTO catalog_members VALUES(?,?,?,?,?,?)');
            for (const member of current.values()) {
                const old = previous.get(member.skill);
                const continuous =
                    old &&
                    sourceKey({ ...previousSource!, package_path: old.package_path }) ===
                        sourceKey({ ...event.payload.source, package_path: member.package_path });
                putMember.run(
                    sequence,
                    member.skill,
                    member.package_path,
                    member.package_sha256,
                    member.metadata_sha256,
                    continuous ? old.first_seen_at : event.occurred_at,
                );
            }
            const putChange = database.prepare('INSERT INTO catalog_changes VALUES(?,?,?,?,?)');
            for (const change of changes)
                putChange.run(
                    sequence,
                    change.skill,
                    change.change_type,
                    change.before ? JSON.stringify(change.before) : null,
                    change.after ? JSON.stringify(change.after) : null,
                );
            return {
                recorded: true,
                event_id: event.event_id,
                event_type: event.event_type,
                sequence,
                ...counts,
            };
        });
    }

    history(value: unknown) {
        new SkillEvidenceValidator().query(value, 'history');
        return this.connection.snapshot(() => this.projectHistory(value));
    }

    /** Validated bounded projection; a composing caller owns the read snapshot. */
    projectHistory(value: unknown) {
        const query = new SkillEvidenceValidator().query(value, 'history');
        const args: SQLInputValue[] = [query.from, query.until];
        const where = ['occurred_at>=?', 'occurred_at<?'];
        if (query.collection) {
            where.push('collection=?');
            args.push(query.collection);
        }
        if (query.observation_sequence !== undefined) {
            where.push('sequence=?');
            args.push(query.observation_sequence);
            const header = this.connection.database
                .prepare(`SELECT * FROM catalog_observations WHERE ${where.join(' AND ')}`)
                .get(...args) as Header | undefined;
            if (!header) throw new SkillOperationError('catalog_unobserved');
            const conditions = ['sequence=?', 'skill>?'];
            const selected: SQLInputValue[] = [header.sequence, query.after_skill ?? ''];
            if (query.skill) {
                conditions.push('skill=?');
                selected.push(query.skill);
            }
            const rows = this.connection.database
                .prepare(
                    `SELECT skill,change_type,before_json,after_json FROM catalog_changes WHERE ${conditions.join(' AND ')} ORDER BY skill LIMIT ?`,
                )
                .all(...selected, query.limit + 1);
            return {
                from: query.from,
                until: query.until,
                observation: this.header(header),
                truncated: rows.length > query.limit,
                next_skill: rows.length > query.limit ? rows[query.limit - 1].skill : null,
                changes: rows.slice(0, query.limit).map((row) => ({
                    skill: row.skill,
                    change_type: row.change_type,
                    before: row.before_json ? JSON.parse(String(row.before_json)) : null,
                    after: row.after_json ? JSON.parse(String(row.after_json)) : null,
                })),
            };
        }
        const index = query.collection
            ? 'catalog_observation_collection'
            : 'catalog_observation_period';
        const candidates = this.connection.database
            .prepare(
                `SELECT * FROM catalog_observations INDEXED BY ${index} WHERE ${where.join(' AND ')} ORDER BY occurred_at LIMIT 5001`,
            )
            .all(...args) as unknown as Header[];
        if (candidates.length > 5000) throw new SkillOperationError('query_limit_exceeded');
        const changed = this.connection.database.prepare(
            'SELECT 1 FROM catalog_changes WHERE sequence=? AND skill=?',
        );
        const rows = candidates
            .filter(
                (row) =>
                    row.sequence > query.after_sequence &&
                    (!query.skill || changed.get(row.sequence, query.skill)),
            )
            .sort((a, b) => a.sequence - b.sequence);
        return {
            from: query.from,
            until: query.until,
            truncated: rows.length > query.limit,
            next_sequence: rows.length > query.limit ? rows[query.limit - 1].sequence : null,
            observations: rows.slice(0, query.limit).map((row) => this.header(row)),
        };
    }

    inactivity(value: unknown) {
        new SkillEvidenceValidator().query(value, 'inactivity');
        return this.connection.snapshot(() => this.projectInactivity(value));
    }

    /** Validated bounded projection; a composing caller owns the read snapshot. */
    projectInactivity(value: unknown) {
        const query = new SkillEvidenceValidator().query(value, 'inactivity');
        const headers = this.latest(query);
        if (!headers.length) throw new SkillOperationError('catalog_unobserved');
        const rows = [];
        for (const header of headers) {
            const source: EvidenceSource = JSON.parse(header.source_json);
            for (const member of this.members(header.sequence)) {
                if (query.skill && member.skill !== query.skill) continue;
                const selected = {
                    ...source,
                    package_path: member.package_path,
                    package_sha256: member.package_sha256,
                };
                const active = this.connection.database
                    .prepare(
                        "SELECT event_id FROM lifecycle_events WHERE collection=? AND skill=? AND source_key=? AND event_type='skill.activated' AND occurred_at>=? AND occurred_at<? LIMIT 1",
                    )
                    .get(
                        header.collection,
                        member.skill,
                        sourceKey(selected),
                        query.from,
                        query.until,
                    );
                if (active) continue;
                rows.push({
                    collection: header.collection,
                    skill: member.skill,
                    source_key: sourceKey(selected),
                    active_identity_key: identityKey(selected),
                    source: selected,
                    observation_sequence: header.sequence,
                    observation_id: header.event_id,
                    observed_at: header.occurred_at,
                    first_seen_at: member.first_seen_at,
                    observed_entire_period: member.first_seen_at <= query.from,
                    activations: 0,
                });
            }
        }
        rows.sort(
            (a, b) => a.collection.localeCompare(b.collection) || a.skill.localeCompare(b.skill),
        );
        return {
            from: query.from,
            until: query.until,
            basis: 'catalog_members_without_reported_activations',
            observed_collections: headers.length,
            truncated: rows.length > query.limit,
            rows: rows.slice(0, query.limit),
        };
    }

    private latest(query: EvidenceQuery): Header[] {
        if (query.collection) {
            const header = this.connection.database
                .prepare(
                    'SELECT * FROM catalog_observations WHERE collection=? AND occurred_at<? ORDER BY occurred_at DESC LIMIT 1',
                )
                .get(query.collection, query.until) as Header | undefined;
            return header ? [header] : [];
        }
        // Bound historical materialization before any per-member activity probes.
        const history = this.connection.database
            .prepare(
                'SELECT * FROM catalog_observations WHERE occurred_at<? ORDER BY occurred_at DESC, sequence DESC LIMIT 4097',
            )
            .all(query.until) as unknown as Header[];
        if (history.length > 4096) throw new SkillOperationError('query_limit_exceeded');
        const latest = new Map<string, Header>();
        for (const header of history)
            if (!latest.has(header.collection)) latest.set(header.collection, header);
        if (latest.size > 64) throw new SkillOperationError('query_limit_exceeded');
        return [...latest.values()];
    }

    private members(sequence: number): MemberRow[] {
        const rows = this.connection.database
            .prepare(
                'SELECT skill,package_path,package_sha256,metadata_sha256,first_seen_at FROM catalog_members WHERE sequence=? ORDER BY skill LIMIT 257',
            )
            .all(sequence) as unknown as MemberRow[];
        if (rows.length > 256) throw new SkillOperationError('query_limit_exceeded');
        return rows;
    }

    private header(row: Header) {
        const { source_json, ...rest } = row;
        return { ...rest, source: JSON.parse(source_json) as EvidenceSource };
    }
}
