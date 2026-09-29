// SPDX-License-Identifier: Apache-2.0
import { lifecycleTypes, lifecycleReasons } from '../validator/SkillEvidenceValidator.ts';

const string = { type: 'string' };
const uuid = {
    type: 'string',
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
};
const slug = { type: 'string', maxLength: 64 };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const sourceProperties = {
    repository: { type: ['string', 'null'], maxLength: 2048 },
    source_ref: { type: ['string', 'null'], maxLength: 128 },
    resolved_git_sha: { type: ['string', 'null'], pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' },
};
const packageProperties = {
    package_path: { type: 'string', maxLength: 1024 },
    package_sha256: hash,
};
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
});
const envelope = {
    schema_version: { const: 2 },
    event_id: uuid,
    correlation_id: uuid,
    occurred_at: string,
    source_host: slug,
    source_adapter: slug,
};
const period = {
    from: string,
    until: string,
    collection: slug,
    skill: slug,
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
};
const writeAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
const readAnnotations = { readOnlyHint: true, openWorldHint: false };

/** Discoverable metadata for the same closed CLI/MCP evidence contracts. */
export class SkillEvidenceToolConfiguration {
    static readonly tools = [
        {
            name: 'skill_lifecycle_record',
            description:
                'Record one explicit lifecycle assertion, at most 8 KiB. Reads never imply activation. Retry the same canonical event ID.',
            inputSchema: object({
                ...envelope,
                event_type: { enum: lifecycleTypes },
                session: uuid,
                payload: object({
                    collection: slug,
                    skill: slug,
                    source: object({ ...sourceProperties, ...packageProperties }),
                    reason: { enum: [null, ...new Set(Object.values(lifecycleReasons).flat())] },
                }),
            }),
            annotations: writeAnnotations,
        },
        {
            name: 'skill_catalog_observe',
            description:
                'Record a complete caller-reported catalog inventory, at most 256 KiB. No scan, source fetch or catalog mutation.',
            inputSchema: object({
                ...envelope,
                event_type: { const: 'catalog.observed' },
                session: { type: 'null' },
                payload: object({
                    collection: slug,
                    source: object(sourceProperties),
                    catalog_sha256: hash,
                    skills: {
                        type: 'array',
                        maxItems: 256,
                        items: object({ skill: slug, ...packageProperties, metadata_sha256: hash }),
                    },
                }),
            }),
            annotations: writeAnnotations,
        },
        {
            name: 'skill_lifecycle_metrics',
            description:
                'Query explicit lifecycle cohorts in a half-open UTC period of at most 366 days. Ratios include their denominators; zero denominators return null.',
            inputSchema: object(
                { ...period, interval: { enum: ['total', 'day', 'month'], default: 'total' } },
                ['from', 'until'],
            ),
            annotations: readAnnotations,
        },
        {
            name: 'skill_routing_overlap',
            description:
                'Query co-routed skill pairs and joint/union counts. This is not semantic similarity.',
            inputSchema: object(period, ['from', 'until']),
            annotations: readAnnotations,
        },
        {
            name: 'skill_catalog_inactivity',
            description:
                'Query observed catalog members without reported activations. Missing catalog evidence is an explicit error; partial observation periods are marked.',
            inputSchema: object(period, ['from', 'until']),
            annotations: readAnnotations,
        },
        {
            name: 'skill_catalog_history',
            description:
                'Page observation summaries by after_sequence, or one observation’s bounded member changes using observation_sequence and after_skill.',
            inputSchema: object(
                {
                    ...period,
                    after_sequence: { type: 'integer', minimum: 0 },
                    observation_sequence: { type: 'integer', minimum: 1 },
                    after_skill: slug,
                },
                ['from', 'until'],
            ),
            annotations: readAnnotations,
        },
    ];
}
