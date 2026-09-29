// SPDX-License-Identifier: Apache-2.0
import { reviewReasons, validationKinds } from '../validator/SkillBumpReportValidator.ts';

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
});
const array = (items: unknown, maxItems: number) => ({ type: 'array', items, maxItems });
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const slug = { type: 'string', maxLength: 64, pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' };
const path = { type: 'string', minLength: 1, maxLength: 1024 };
const mode = { type: 'integer', minimum: 0, maximum: 511 };
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: 'null' }] });
const entry = {
    oneOf: [
        object({
            path,
            type: { const: 'file' },
            mode,
            size: { type: 'integer', minimum: 0, maximum: 67108864 },
            sha256: hash,
        }),
        object({ path, type: { const: 'directory' }, mode }),
        object({
            path,
            type: { const: 'symlink' },
            mode,
            target_sha256: hash,
            target_is_absolute: { type: 'boolean' },
        }),
    ],
};
const contract = object({
    id: slug,
    kind: { enum: ['capability', 'input', 'output', 'compatibility', 'integration'] },
    required: { type: 'boolean' },
    signature_sha256: hash,
    files: { ...array(object({ path, sha256: hash }), 8), minItems: 1 },
});
const observation = object({
    schema_version: { const: 1 },
    subject: object({
        scope: { enum: ['skill', 'collection'] },
        collection: slug,
        skill: nullable(slug),
    }),
    source: object({
        repository: nullable({ type: 'string', maxLength: 2048 }),
        source_ref: nullable({ type: 'string', maxLength: 128 }),
        resolved_git_sha: nullable({ type: 'string', pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }),
    }),
    inventory: object({ root_mode: mode, entries: array(entry, 1024) }),
    content_identity: object({ algorithm: { const: 'sha256-observation-v1' }, sha256: hash }),
    snapshot_tree_sha256: hash,
    contracts: object({
        coverage: { enum: ['complete', 'partial', 'not_provided'] },
        entries: array(contract, 128),
    }),
    validation: array(
        object({
            kind: { enum: validationKinds },
            status: { enum: ['passed', 'failed', 'not_run'] },
            content_sha256: hash,
            evidence_sha256: nullable(hash),
        }),
        5,
    ),
});
const pinned = object({ sha256: hash, observation });
const assessment = object({
    before_sha256: hash,
    after_sha256: hash,
    coverage: { enum: ['complete', 'partial'] },
    files: array(
        object({
            path,
            reason: { enum: reviewReasons },
            contracts: array(slug, 128),
            evidence_sha256: hash,
        }),
        2049,
    ),
    contracts: array(
        object({ id: slug, reason: { enum: reviewReasons }, evidence_sha256: hash }),
        256,
    ),
    provenance: nullable(
        object({
            reason: { enum: ['compatible_correction', 'required_migration', 'undetermined'] },
            evidence_sha256: hash,
        }),
    ),
});

/** Closed read-only tool metadata for the shared report and installed guide services. */
export class SkillBumpToolConfiguration {
    static readonly tools = [
        {
            name: 'skill_bump_report',
            description:
                'Compare two pinned skill/collection observations and explicit contract reviews. At most 768 KiB; hashes alone never justify compatibility. No files, versions or databases are changed.',
            inputSchema: object(
                {
                    schema_version: { const: 1 },
                    before: pinned,
                    after: pinned,
                    assessment: nullable(assessment),
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                    offset: { type: 'integer', minimum: 0, maximum: 4096, default: 0 },
                },
                ['schema_version', 'before', 'after', 'assessment'],
            ),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        {
            name: 'skill_onboarding',
            description:
                'Read the installed versioned inspect/snapshot/audit/plan/evolve/verify/bump guide and complete inert examples. The guide does not execute any command.',
            inputSchema: object(
                {
                    section: {
                        enum: [
                            'all',
                            'inspect',
                            'snapshot',
                            'audit',
                            'plan',
                            'evolve',
                            'verify',
                            'bump',
                        ],
                        default: 'all',
                    },
                },
                [],
            ),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
    ];
}
