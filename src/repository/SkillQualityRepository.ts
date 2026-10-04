// SPDX-License-Identifier: Apache-2.0
import type { SQLInputValue } from 'node:sqlite';
import { SkillEvidenceDatabaseRepository } from './SkillEvidenceDatabaseRepository.ts';
import { SkillEvidenceEventRepository } from './SkillEvidenceEventRepository.ts';
import { SkillEvidenceContractValidator } from '../validator/SkillEvidenceContractValidator.ts';
import {
    QUALITY_PERIOD_ROWS,
    QUALITY_RECEIPT_BYTES,
    SkillQualityValidator,
} from '../validator/SkillQualityValidator.ts';
import type { SkillQualityQuery, SkillQualityReceipt } from '../validator/SkillQualityValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

type QualityRow = {
    event_id: string;
    correlation_id: string;
    collection: string;
    skill: string;
    source_key: string;
    identity_key: string;
    occurred_at: string;
    recorded_at: string;
    kind: string;
    assurance: string;
    method_name: string;
    result: string;
};

/** Immutable explicit caller assertions and bounded exact-revision inspection. */
export class SkillQualityRepository {
    private readonly connection: SkillEvidenceDatabaseRepository;
    private readonly validator = new SkillQualityValidator();
    private readonly now: () => string;
    private readonly observation?: (capability: object) => SkillQualityReceipt;

    constructor(
        connection: SkillEvidenceDatabaseRepository,
        now = () => new Date().toISOString(),
        observation?: (capability: object) => SkillQualityReceipt,
    ) {
        this.connection = connection;
        this.now = now;
        this.observation = observation;
    }

    record(value: unknown) {
        const receipt = this.validator.assertion(value);
        return this.persist(receipt);
    }

    /** Internal capability ingress; ordinary JSON cannot select a trusted tier. */
    recordObservation(capability: object) {
        if (!this.observation) throw new SkillOperationError('invalid_input');
        const receipt = this.validator.receipt(this.observation(capability));
        if (receipt.payload.assurance === 'caller_assertion')
            throw new SkillOperationError('invalid_input');
        return this.persist(receipt);
    }

    private persist(receipt: SkillQualityReceipt) {
        const payload = receipt.payload;
        return this.connection.transaction(() => {
            const recorded = new SkillEvidenceEventRepository(this.connection.database).claim(
                receipt,
            );
            if (!recorded) {
                const row = this.connection.database
                    .prepare(
                        'SELECT event_id,correlation_id,collection,skill,source_key,identity_key,occurred_at,recorded_at,kind,assurance,method_name,result FROM quality_receipts WHERE event_id=?',
                    )
                    .get(receipt.event_id) as QualityRow | undefined;
                if (!row) throw new SkillOperationError('storage_unavailable');
                this.receipt(row);
                return this.recordResult(receipt, false);
            }
            const recordedAt = new SkillEvidenceContractValidator().timestamp(this.now());
            this.connection.database
                .prepare(
                    `INSERT INTO quality_receipts (
event_id,correlation_id,collection,skill,source_key,identity_key,source_json,occurred_at,recorded_at,kind,assurance,method_name,result
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                )
                .run(
                    receipt.event_id,
                    receipt.correlation_id,
                    payload.collection,
                    payload.skill,
                    SkillEvidenceContractValidator.sourceKey(payload.source),
                    SkillEvidenceContractValidator.identityKey(payload.source),
                    JSON.stringify(payload.source),
                    receipt.occurred_at,
                    recordedAt,
                    payload.kind,
                    payload.assurance,
                    payload.method.name,
                    payload.result,
                );
            return this.recordResult(receipt, true);
        });
    }

    inspect(value: unknown) {
        const query = this.validator.query(value);
        return this.connection.snapshot(() => this.projectQuery(query));
    }

    /** For composition inside an already-owned consistent snapshot. */
    project(value: unknown) {
        return this.projectQuery(this.validator.query(value));
    }

    projectOccurrences(value: unknown) {
        return this.periodRows(this.validator.query(value)).map((row) => ({
            family: 'skill.quality.recorded',
            occurred_at: row.occurred_at,
        }));
    }

    private projectQuery(query: SkillQualityQuery) {
        const period = this.periodRows(query);
        const remaining =
            query.after === undefined
                ? period
                : period.filter(
                      (row) =>
                          row.occurred_at > query.after!.occurred_at ||
                          (row.occurred_at === query.after!.occurred_at &&
                              row.event_id > query.after!.event_id),
                  );
        const selected = remaining.slice(0, query.limit).map((row) => this.receipt(row));
        const truncated = remaining.length > query.limit;
        return this.validator.response({
            schema_version: 1,
            operation: 'quality_inspect',
            basis: 'recorded_exact_revision_receipts',
            scope: {
                collection: query.collection,
                from: query.from,
                until: query.until,
                skill: query.skill ?? null,
                kind: query.kind ?? null,
                source_key: query.source_key ?? null,
                identity_key: query.identity_key ?? null,
            },
            matching_receipts: period.length,
            kinds: {
                official_validation: period.filter((row) => row.kind === 'official_validation')
                    .length,
                behavioral_evaluation: period.filter((row) => row.kind === 'behavioral_evaluation')
                    .length,
            },
            truncated,
            next_cursor: truncated ? this.validator.cursor(query, selected.at(-1)!.receipt) : null,
            rows: selected,
            limits: {
                period_rows: QUALITY_PERIOD_ROWS,
                entries: query.limit,
                artifact_locators: 'inert_not_dereferenced',
                hashes_authenticate_process: false,
                readiness_assessed: false,
            },
        });
    }

    private periodRows(query: SkillQualityQuery): QualityRow[] {
        const conditions = ['collection=?', 'occurred_at>=?', 'occurred_at<?'];
        const args: SQLInputValue[] = [query.collection, query.from, query.until];
        for (const field of ['skill', 'kind', 'source_key', 'identity_key'] as const) {
            if (query[field] === undefined) continue;
            conditions.push(`${field}=?`);
            args.push(query[field]!);
        }
        const index = query.identity_key
            ? 'quality_identity_period'
            : query.source_key
              ? 'quality_source_period'
              : query.skill
                ? 'quality_skill_period'
                : query.kind
                  ? 'quality_kind_period'
                  : 'quality_collection_period';
        const rows = this.connection.database
            .prepare(
                `SELECT event_id,correlation_id,collection,skill,source_key,identity_key,occurred_at,recorded_at,kind,assurance,method_name,result FROM quality_receipts INDEXED BY ${index} WHERE ${conditions.join(' AND ')} ORDER BY occurred_at,event_id LIMIT ?`,
            )
            .all(...args, QUALITY_PERIOD_ROWS + 1) as unknown as QualityRow[];
        if (rows.length > QUALITY_PERIOD_ROWS)
            throw new SkillOperationError('query_limit_exceeded');
        return rows;
    }

    private receipt(row: QualityRow) {
        const stored = this.connection.database
            .prepare(
                `SELECT e.envelope,q.source_json FROM usage_events e JOIN quality_receipts q ON q.event_id=e.event_id WHERE e.event_id=? AND length(CAST(e.envelope AS BLOB))<=? AND length(CAST(q.source_json AS BLOB))<=?`,
            )
            .get(row.event_id, QUALITY_RECEIPT_BYTES, QUALITY_RECEIPT_BYTES);
        if (!stored) throw new SkillOperationError('storage_unavailable');
        try {
            const envelope = String(stored.envelope);
            const receipt = this.validator.receipt(JSON.parse(envelope));
            const payload = receipt.payload;
            new SkillEvidenceContractValidator().timestamp(row.recorded_at);
            const expected = [
                receipt.event_id,
                receipt.correlation_id,
                payload.collection,
                payload.skill,
                SkillEvidenceContractValidator.sourceKey(payload.source),
                SkillEvidenceContractValidator.identityKey(payload.source),
                receipt.occurred_at,
                payload.kind,
                payload.assurance,
                payload.method.name,
                payload.result,
            ];
            const observed = [
                row.event_id,
                row.correlation_id,
                row.collection,
                row.skill,
                row.source_key,
                row.identity_key,
                row.occurred_at,
                row.kind,
                row.assurance,
                row.method_name,
                row.result,
            ];
            if (
                JSON.stringify(expected) !== JSON.stringify(observed) ||
                JSON.stringify(receipt) !== envelope ||
                JSON.stringify(payload.source) !== stored.source_json
            )
                throw new Error('Projection identity changed');
            return { receipt, recorded_at: row.recorded_at };
        } catch {
            throw new SkillOperationError('storage_unavailable');
        }
    }

    private recordResult(receipt: SkillQualityReceipt, recorded: boolean) {
        return {
            recorded,
            event_id: receipt.event_id,
            event_type: receipt.event_type,
            assurance: receipt.payload.assurance,
            identity_key: SkillEvidenceContractValidator.identityKey(receipt.payload.source),
        };
    }
}
