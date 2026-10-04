// SPDX-License-Identifier: Apache-2.0
/** Discoverable closed quality ingress; assurance is derived only by the server. */
export class SkillQualityToolConfiguration {
    private static object(properties: Record<string, unknown>, required = Object.keys(properties)) {
        return { type: 'object', properties, required, additionalProperties: false };
    }
    private static readonly slug = {
        type: 'string',
        pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
        maxLength: 64,
    };
    private static readonly hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
    private static readonly count = { type: 'integer', minimum: 0, maximum: 160 };
    private static readonly uuid = {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    };
    private static readonly official = this.object(
        Object.fromEntries(
            ['selected_packages', 'executed', 'blocked', 'not_run', 'passed', 'failed'].map(
                (key) => [key, { type: 'integer', minimum: 0, maximum: 1 }],
            ),
        ),
    );
    private static readonly behavioral = this.object({
        ...Object.fromEntries(
            [
                'expected_pairs',
                'imported_runs',
                'missing_runs',
                'paired_cases',
                'declared_agent_pairs',
                'declared_controlled_agent_pairs',
                'fixture_runs',
                'manual_runs',
                'unexecuted_runs',
            ].map((key) => [key, this.count]),
        ),
        critical_failures: { type: 'integer', minimum: 0, maximum: 10240 },
        treatment_critical_failures: { type: 'integer', minimum: 0, maximum: 5120 },
        comparison_status: { enum: ['complete', 'incomplete'] },
        selected_cases: {
            type: 'array',
            minItems: 1,
            maxItems: 16,
            items: this.object({
                case_id: this.slug,
                phase: { enum: ['final-acceptance', 'tuning', 'exploratory'] },
                attempts: { type: 'integer', minimum: 1, maximum: 5 },
                joint_workflow: { type: 'boolean' },
            }),
        },
        treatment: this.object(
            Object.fromEntries(
                [
                    'expected',
                    'executed',
                    'blocked',
                    'not_run',
                    'missing',
                    'passed',
                    'failed',
                    'unresolved',
                ].map((key) => [key, { type: 'integer', minimum: 0, maximum: 80 }]),
            ),
        ),
    });
    private static readonly receipt = this.object({
        schema_version: { const: 2 },
        event_type: { const: 'skill.quality.recorded' },
        event_id: this.uuid,
        correlation_id: this.uuid,
        occurred_at: { type: 'string' },
        source_host: this.slug,
        source_adapter: this.slug,
        session: { type: 'null' },
        payload: this.object({
            collection: this.slug,
            skill: this.slug,
            source: this.object({
                repository: { type: ['string', 'null'], maxLength: 2048 },
                source_ref: { type: ['string', 'null'], maxLength: 128 },
                resolved_git_sha: {
                    type: ['string', 'null'],
                    pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$',
                },
                package_path: { type: 'string', maxLength: 1024 },
                package_sha256: this.hash,
            }),
            kind: { enum: ['official_validation', 'behavioral_evaluation'] },
            method: this.object({
                name: this.slug,
                version: { type: ['string', 'null'], maxLength: 128 },
                revision: { type: ['string', 'null'], pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' },
                source_sha256: { anyOf: [this.hash, { type: 'null' }] },
            }),
            result: { enum: ['pass', 'fail', 'blocked', 'not-run'] },
            coverage: { anyOf: [this.official, this.behavioral] },
            artifacts: {
                type: 'array',
                minItems: 1,
                maxItems: 16,
                items: this.object({
                    locator: { type: 'string', maxLength: 1024 },
                    sha256: this.hash,
                    scope: {
                        enum: [
                            'official_result',
                            'benchmark_manifest',
                            'benchmark_run',
                            'evaluation_artifact',
                            'comparison_summary',
                        ],
                    },
                }),
            },
            limitations: {
                type: 'array',
                maxItems: 32,
                items: {
                    enum: [
                        'caller_assertion',
                        'source_identity_asserted',
                        'artifact_locator_inert',
                        'validator_authenticity_unverified',
                        'behavior_not_assessed',
                        'grading_asserted',
                        'executor_asserted',
                        'metrics_asserted',
                        'joint_workflow',
                        'comparison_incomplete',
                        'fixture_evidence',
                        'manual_evidence',
                        'acceptance_is_phase_label',
                        'historical_revision',
                        'reported_budget_overrun',
                        'retained_run_limitations',
                    ],
                },
            },
        }),
    });
    static readonly tools = [
        {
            name: 'skill_quality_record',
            description:
                'Explicit exact-revision metadata receipt, at most 16 KiB. Pure metadata is caller_assertion. Optional selected package bytes or full retained benchmark verification; no official process execution. Database must be outside protected roots.',
            inputSchema: this.object(
                {
                    receipt: this.receipt,
                    package_root: { type: 'string', maxLength: 4096 },
                    benchmark: { type: 'string', maxLength: 4096 },
                },
                ['receipt'],
            ),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        {
            name: 'skill_quality_inspect',
            description:
                'Read-only bounded exact-revision receipt query: 5,000 matching rows, 100 displayed entries, 64 KiB output, a half-open UTC period up to 366 days. No creation, upgrade or locator dereference.',
            inputSchema: this.object(
                {
                    collection: this.slug,
                    from: { type: 'string' },
                    until: { type: 'string' },
                    skill: this.slug,
                    kind: { enum: ['official_validation', 'behavioral_evaluation'] },
                    source_key: this.hash,
                    identity_key: this.hash,
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                    after: { type: 'string', maxLength: 256 },
                },
                ['collection', 'from', 'until'],
            ),
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
    ];
}
