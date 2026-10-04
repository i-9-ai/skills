// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import { SkillEvidenceContractValidator } from './SkillEvidenceContractValidator.ts';
import type { EvidenceEnvelope, PackageEvidenceSource } from './SkillEvidenceContractValidator.ts';
import { SkillOperationError } from './SkillOperationError.ts';

export const QUALITY_RECEIPT_BYTES = 16_384;
export const QUALITY_QUERY_BYTES = 4096;
export const QUALITY_OUTPUT_BYTES = 65_536;
export const QUALITY_PERIOD_ROWS = 5000;
export const qualityKinds = ['official_validation', 'behavioral_evaluation'] as const;
export const qualityAssurances = [
    'caller_assertion',
    'locally_observed_official_process',
    'verified_retained_benchmark',
] as const;
export const qualityResults = ['pass', 'fail', 'blocked', 'not-run'] as const;
export const qualityLimitations = [
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
] as const;
type QualityKind = (typeof qualityKinds)[number];
type QualityResult = (typeof qualityResults)[number];
type QualityAssurance = (typeof qualityAssurances)[number];
type QualityMethod = {
    name: string;
    version: string | null;
    revision: string | null;
    source_sha256: string | null;
};
type QualityArtifact = { locator: string; sha256: string; scope: string };
type OfficialCoverage = {
    selected_packages: number;
    executed: number;
    blocked: number;
    not_run: number;
    passed: number;
    failed: number;
};
type TreatmentCoverage = {
    expected: number;
    executed: number;
    blocked: number;
    not_run: number;
    missing: number;
    passed: number;
    failed: number;
    unresolved: number;
};
export type BehavioralCoverage = {
    expected_pairs: number;
    imported_runs: number;
    missing_runs: number;
    paired_cases: number;
    declared_agent_pairs: number;
    declared_controlled_agent_pairs: number;
    fixture_runs: number;
    manual_runs: number;
    unexecuted_runs: number;
    critical_failures: number;
    treatment_critical_failures: number;
    comparison_status: 'complete' | 'incomplete';
    selected_cases: Array<{
        case_id: string;
        phase: 'final-acceptance' | 'tuning' | 'exploratory';
        attempts: number;
        joint_workflow: boolean;
    }>;
    treatment: TreatmentCoverage;
};
export type SkillQualityReceipt = EvidenceEnvelope & {
    event_type: 'skill.quality.recorded';
    session: null;
    payload: {
        collection: string;
        skill: string;
        source: PackageEvidenceSource;
        kind: QualityKind;
        assurance: QualityAssurance;
        method: QualityMethod;
        result: QualityResult;
        coverage: OfficialCoverage | BehavioralCoverage;
        artifacts: QualityArtifact[];
        limitations: Array<(typeof qualityLimitations)[number]>;
        benchmark?: {
            suite: string;
            benchmark_sha256: string;
            scope: 'selected_package_cases';
            suite_comparison_status: 'complete' | 'incomplete';
            suite_observed_treatment_result: 'pass' | 'fail' | 'blocked';
            result_basis: 'critical_treatment_criteria';
            baseline_failed_criteria: number;
            treatment_failed_criteria: number;
            baseline_overruns: number;
            treatment_overruns: number;
            runs_with_limitations: number;
            comparability_reasons: string[];
        };
    };
};
export type SkillQualityQuery = {
    collection: string;
    from: string;
    until: string;
    skill?: string;
    kind?: QualityKind;
    source_key?: string;
    identity_key?: string;
    limit: number;
    after?: { occurred_at: string; event_id: string };
    scope_key: string;
};

/** Closed assertions only; public inputs cannot select a process-observation tier. */
export class SkillQualityValidator {
    private readonly contract = new SkillEvidenceContractValidator();

    request(value: unknown) {
        const input = this.contract.object(value, ['receipt', 'package_root', 'benchmark'], false);
        const receipt = this.assertion(input.receipt);
        const selection = (value: unknown): string | undefined => {
            if (value === undefined) return undefined;
            if (
                typeof value !== 'string' ||
                !isAbsolute(value) ||
                value.length > 4096 ||
                /[\u0000-\u001f\u007f]/u.test(value)
            )
                this.contract.invalid();
            return value as string;
        };
        const package_root = selection(input.package_root);
        const benchmark = selection(input.benchmark);
        if (benchmark && receipt.payload.kind !== 'behavioral_evaluation') this.contract.invalid();
        return {
            receipt,
            ...(package_root ? { package_root } : {}),
            ...(benchmark ? { benchmark } : {}),
        };
    }

    assertion(value: unknown): SkillQualityReceipt {
        return this.normalize(value, false);
    }

    /** Stored validation is not an ingress or proof that a declared process occurred. */
    receipt(value: unknown): SkillQualityReceipt {
        return this.normalize(value, true);
    }

    query(value: unknown): SkillQualityQuery {
        this.bounded(value, QUALITY_QUERY_BYTES);
        const input = this.contract.object(
            value,
            [
                'collection',
                'from',
                'until',
                'skill',
                'kind',
                'source_key',
                'identity_key',
                'limit',
                'after',
            ],
            false,
        );
        const collection = this.contract.slug(input.collection);
        const from = this.contract.timestamp(input.from);
        const until = this.contract.timestamp(input.until);
        if (from >= until || Date.parse(until) - Date.parse(from) > 366 * 86400000)
            this.contract.invalid();
        const skill = input.skill === undefined ? undefined : this.contract.slug(input.skill);
        const kind = input.kind === undefined ? undefined : this.choice(input.kind, qualityKinds);
        const source =
            input.source_key === undefined ? undefined : this.contract.hash(input.source_key);
        const identity =
            input.identity_key === undefined ? undefined : this.contract.hash(input.identity_key);
        const scope = SkillEvidenceContractValidator.evidenceDigest([
            collection,
            from,
            until,
            skill ?? null,
            kind ?? null,
            source ?? null,
            identity ?? null,
        ]);
        let after: SkillQualityQuery['after'];
        if (input.after !== undefined) {
            if (
                typeof input.after !== 'string' ||
                input.after.length > 256 ||
                !/^[A-Za-z0-9_-]+$/.test(input.after)
            )
                this.contract.invalid();
            try {
                const bytes = Buffer.from(input.after as string, 'base64url');
                if (bytes.toString('base64url') !== input.after) this.contract.invalid();
                const cursor: unknown = JSON.parse(bytes.toString('utf8'));
                if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[2] !== scope)
                    this.contract.invalid();
                const values = cursor as unknown[];
                const occurred = this.contract.timestamp(values[0]);
                if (occurred < from || occurred >= until) this.contract.invalid();
                after = { occurred_at: occurred, event_id: this.contract.uuid(values[1]) };
            } catch {
                this.contract.invalid();
            }
        }
        return {
            collection,
            from,
            until,
            ...(skill === undefined ? {} : { skill }),
            ...(kind === undefined ? {} : { kind }),
            ...(source === undefined ? {} : { source_key: source }),
            ...(identity === undefined ? {} : { identity_key: identity }),
            limit: this.contract.integer(input.limit ?? 20, 1, 100),
            ...(after === undefined ? {} : { after }),
            scope_key: scope,
        };
    }

    cursor(query: SkillQualityQuery, receipt: SkillQualityReceipt): string {
        return Buffer.from(
            JSON.stringify([receipt.occurred_at, receipt.event_id, query.scope_key]),
        ).toString('base64url');
    }

    response<T>(value: T): T {
        if (Buffer.byteLength(JSON.stringify(value)) > QUALITY_OUTPUT_BYTES)
            throw new SkillOperationError('response_too_large');
        return value;
    }

    private normalize(value: unknown, stored: boolean): SkillQualityReceipt {
        const event = this.contract.envelope(value, QUALITY_RECEIPT_BYTES);
        if (event.event_type !== 'skill.quality.recorded' || event.session !== null)
            this.contract.invalid();
        const fields = [
            'collection',
            'skill',
            'source',
            'kind',
            'method',
            'result',
            'coverage',
            'artifacts',
            'limitations',
        ];
        if (stored) fields.push('assurance', 'benchmark');
        const payload = this.contract.object(event.payload, fields, false);
        if (
            fields
                .filter((field) => field !== 'benchmark')
                .some((field) => !Object.hasOwn(payload, field))
        )
            this.contract.invalid();
        const kind = this.choice(payload.kind, qualityKinds);
        const result = this.choice(payload.result, qualityResults);
        const method = this.contract.object(payload.method, [
            'name',
            'version',
            'revision',
            'source_sha256',
        ]);
        const revision = method.revision;
        if (
            revision !== null &&
            (typeof revision !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))
        )
            this.contract.invalid();
        const artifacts = this.list(
            payload.artifacts,
            stored && payload.assurance === 'verified_retained_benchmark' ? 161 : 16,
            1,
        )
            .map((value) => {
                const artifact = this.contract.object(value, ['locator', 'sha256', 'scope']);
                return {
                    locator: this.contract.path(artifact.locator),
                    sha256: this.contract.hash(artifact.sha256),
                    scope: this.choice(artifact.scope, [
                        'official_result',
                        'benchmark_manifest',
                        'benchmark_run',
                        'evaluation_artifact',
                        'comparison_summary',
                    ] as const),
                };
            })
            .sort((left, right) =>
                Buffer.compare(Buffer.from(left.locator), Buffer.from(right.locator)),
            );
        if (new Set(artifacts.map((artifact) => artifact.locator)).size !== artifacts.length)
            this.contract.invalid();
        const coverage =
            kind === 'official_validation'
                ? this.officialCoverage(payload.coverage, result)
                : this.behavioralCoverage(payload.coverage, result);
        const limitations = this.list(payload.limitations, 32).map((item) =>
            this.choice(item, qualityLimitations),
        );
        const assurance = stored
            ? this.choice(payload.assurance, qualityAssurances)
            : 'caller_assertion';
        if (
            (assurance === 'locally_observed_official_process' && kind !== 'official_validation') ||
            (assurance === 'verified_retained_benchmark' && kind !== 'behavioral_evaluation')
        )
            this.contract.invalid();
        const required: Array<(typeof qualityLimitations)[number]> = [
            'source_identity_asserted',
            'artifact_locator_inert',
        ];
        if (assurance === 'caller_assertion') required.push('caller_assertion');
        if (kind === 'official_validation')
            required.push('validator_authenticity_unverified', 'behavior_not_assessed');
        else {
            required.push(
                'grading_asserted',
                'executor_asserted',
                'metrics_asserted',
                'acceptance_is_phase_label',
            );
            const selected = coverage as BehavioralCoverage;
            if (selected.selected_cases.some((item) => item.joint_workflow))
                required.push('joint_workflow');
            if (selected.comparison_status === 'incomplete') required.push('comparison_incomplete');
            if (selected.fixture_runs > 0) required.push('fixture_evidence');
            if (selected.manual_runs > 0) required.push('manual_evidence');
        }
        const benchmark =
            payload.benchmark === undefined
                ? undefined
                : this.benchmark(payload.benchmark, coverage as BehavioralCoverage);
        if ((assurance === 'verified_retained_benchmark') !== (benchmark !== undefined))
            this.contract.invalid();
        if (benchmark?.baseline_overruns || benchmark?.treatment_overruns)
            required.push('reported_budget_overrun');
        if (benchmark?.runs_with_limitations) required.push('retained_run_limitations');
        const normalized: SkillQualityReceipt = {
            ...this.contract.common(event),
            event_type: 'skill.quality.recorded',
            session: null,
            payload: {
                collection: this.contract.slug(payload.collection),
                skill: this.contract.slug(payload.skill),
                source: this.contract.packageSource(payload.source),
                kind,
                assurance,
                method: {
                    name: this.contract.slug(method.name),
                    version: this.version(method.version),
                    revision: revision as string | null,
                    source_sha256:
                        method.source_sha256 === null
                            ? null
                            : this.contract.hash(method.source_sha256),
                },
                result,
                coverage,
                artifacts,
                limitations: [...new Set([...limitations, ...required])].sort(),
                ...(benchmark === undefined ? {} : { benchmark }),
            },
        };
        this.bounded(normalized, QUALITY_RECEIPT_BYTES);
        return normalized;
    }

    private officialCoverage(value: unknown, result: QualityResult): OfficialCoverage {
        const input = this.contract.object(value, [
            'selected_packages',
            'executed',
            'blocked',
            'not_run',
            'passed',
            'failed',
        ]);
        const selected: OfficialCoverage = {
            selected_packages: this.contract.integer(input.selected_packages, 1, 1),
            executed: this.contract.integer(input.executed, 0, 1),
            blocked: this.contract.integer(input.blocked, 0, 1),
            not_run: this.contract.integer(input.not_run, 0, 1),
            passed: this.contract.integer(input.passed, 0, 1),
            failed: this.contract.integer(input.failed, 0, 1),
        };
        if (
            selected.executed + selected.blocked + selected.not_run !== 1 ||
            selected.executed !== selected.passed + selected.failed
        )
            this.contract.invalid();
        const actual = selected.passed
            ? 'pass'
            : selected.failed
              ? 'fail'
              : selected.blocked
                ? 'blocked'
                : 'not-run';
        if (actual !== result) this.contract.invalid();
        return selected;
    }

    private behavioralCoverage(value: unknown, result: QualityResult): BehavioralCoverage {
        const fields = [
            'expected_pairs',
            'imported_runs',
            'missing_runs',
            'paired_cases',
            'declared_agent_pairs',
            'declared_controlled_agent_pairs',
            'fixture_runs',
            'manual_runs',
            'unexecuted_runs',
            'critical_failures',
            'treatment_critical_failures',
            'comparison_status',
            'selected_cases',
            'treatment',
        ];
        const input = this.contract.object(value, fields);
        const count = (field: string, maximum = 160) =>
            this.contract.integer(input[field], 0, maximum);
        const cases = this.list(input.selected_cases, 16, 1)
            .map((value) => {
                const selected = this.contract.object(value, [
                    'case_id',
                    'phase',
                    'attempts',
                    'joint_workflow',
                ]);
                if (typeof selected.joint_workflow !== 'boolean') this.contract.invalid();
                return {
                    case_id: this.contract.slug(selected.case_id),
                    phase: this.choice(selected.phase, [
                        'final-acceptance',
                        'tuning',
                        'exploratory',
                    ] as const),
                    attempts: this.contract.integer(selected.attempts, 1, 5),
                    joint_workflow: selected.joint_workflow as boolean,
                };
            })
            .sort((left, right) => left.case_id.localeCompare(right.case_id, 'en'));
        if (new Set(cases.map((selected) => selected.case_id)).size !== cases.length)
            this.contract.invalid();
        const treatmentInput = this.contract.object(input.treatment, [
            'expected',
            'executed',
            'blocked',
            'not_run',
            'missing',
            'passed',
            'failed',
            'unresolved',
        ]);
        const treatment: TreatmentCoverage = {
            expected: this.contract.integer(treatmentInput.expected, 1, 80),
            executed: this.contract.integer(treatmentInput.executed, 0, 80),
            blocked: this.contract.integer(treatmentInput.blocked, 0, 80),
            not_run: this.contract.integer(treatmentInput.not_run, 0, 80),
            missing: this.contract.integer(treatmentInput.missing, 0, 80),
            passed: this.contract.integer(treatmentInput.passed, 0, 80),
            failed: this.contract.integer(treatmentInput.failed, 0, 80),
            unresolved: this.contract.integer(treatmentInput.unresolved, 0, 80),
        };
        const coverage: BehavioralCoverage = {
            expected_pairs: this.contract.integer(input.expected_pairs, 1, 80),
            imported_runs: count('imported_runs'),
            missing_runs: count('missing_runs'),
            paired_cases: count('paired_cases', 80),
            declared_agent_pairs: count('declared_agent_pairs', 80),
            declared_controlled_agent_pairs: count('declared_controlled_agent_pairs', 80),
            fixture_runs: count('fixture_runs'),
            manual_runs: count('manual_runs'),
            unexecuted_runs: count('unexecuted_runs'),
            critical_failures: count('critical_failures', 10_240),
            treatment_critical_failures: count('treatment_critical_failures', 5120),
            comparison_status: this.choice(input.comparison_status, [
                'complete',
                'incomplete',
            ] as const),
            selected_cases: cases,
            treatment,
        };
        const importedTreatment = treatment.executed + treatment.blocked + treatment.not_run;
        const importedBaseline = coverage.imported_runs - importedTreatment;
        const executedRuns = coverage.imported_runs - coverage.unexecuted_runs;
        if (
            coverage.expected_pairs !==
                cases.reduce((total, selected) => total + selected.attempts, 0) ||
            coverage.imported_runs + coverage.missing_runs !== coverage.expected_pairs * 2 ||
            coverage.paired_cases < Math.max(0, coverage.imported_runs - coverage.expected_pairs) ||
            coverage.paired_cases > Math.min(importedTreatment, importedBaseline) ||
            coverage.declared_agent_pairs > coverage.paired_cases ||
            coverage.declared_agent_pairs > treatment.executed ||
            coverage.declared_agent_pairs > executedRuns - treatment.executed ||
            coverage.declared_agent_pairs * 2 >
                coverage.imported_runs - coverage.fixture_runs - coverage.manual_runs ||
            coverage.declared_controlled_agent_pairs > coverage.declared_agent_pairs ||
            coverage.fixture_runs + coverage.manual_runs > coverage.imported_runs ||
            coverage.unexecuted_runs > coverage.imported_runs ||
            treatment.expected !== coverage.expected_pairs ||
            treatment.executed + treatment.blocked + treatment.not_run + treatment.missing !==
                treatment.expected ||
            treatment.executed !== treatment.passed + treatment.failed + treatment.unresolved ||
            treatment.missing > coverage.missing_runs ||
            importedTreatment > coverage.imported_runs ||
            treatment.executed > executedRuns ||
            treatment.blocked + treatment.not_run > coverage.unexecuted_runs ||
            coverage.treatment_critical_failures > coverage.critical_failures ||
            (coverage.treatment_critical_failures > 0 && treatment.failed === 0)
        )
            this.contract.invalid();
        if (
            coverage.comparison_status === 'complete' &&
            (coverage.missing_runs !== 0 ||
                coverage.unexecuted_runs !== 0 ||
                coverage.declared_controlled_agent_pairs !== coverage.expected_pairs ||
                coverage.fixture_runs !== 0 ||
                coverage.manual_runs !== 0 ||
                treatment.unresolved !== 0)
        )
            this.contract.invalid();
        const actual: QualityResult =
            treatment.failed > 0
                ? 'fail'
                : treatment.passed === treatment.expected
                  ? 'pass'
                  : treatment.not_run + treatment.missing === treatment.expected
                    ? 'not-run'
                    : 'blocked';
        if (actual !== result) this.contract.invalid();
        return coverage;
    }

    private benchmark(
        value: unknown,
        coverage: BehavioralCoverage,
    ): NonNullable<SkillQualityReceipt['payload']['benchmark']> {
        const input = this.contract.object(value, [
            'suite',
            'benchmark_sha256',
            'scope',
            'suite_comparison_status',
            'suite_observed_treatment_result',
            'result_basis',
            'baseline_failed_criteria',
            'treatment_failed_criteria',
            'baseline_overruns',
            'treatment_overruns',
            'runs_with_limitations',
            'comparability_reasons',
        ]);
        if (
            input.scope !== 'selected_package_cases' ||
            input.result_basis !== 'critical_treatment_criteria'
        )
            this.contract.invalid();
        const reasons = this.list(input.comparability_reasons, 12).map((item) =>
            this.choice(item, [
                'missing_arm',
                'unexecuted_arm',
                'non_agent_pair',
                'fresh_context_unasserted',
                'baseline_overrun',
                'treatment_overrun',
                'model_unknown',
                'environment_unknown',
                'settings_unknown',
                'model_different',
                'environment_different',
                'settings_different',
            ] as const),
        );
        return {
            suite: this.contract.slug(input.suite),
            benchmark_sha256: this.contract.hash(input.benchmark_sha256),
            scope: 'selected_package_cases',
            suite_comparison_status: this.choice(input.suite_comparison_status, [
                'complete',
                'incomplete',
            ] as const),
            suite_observed_treatment_result: this.choice(input.suite_observed_treatment_result, [
                'pass',
                'fail',
                'blocked',
            ] as const),
            result_basis: 'critical_treatment_criteria',
            baseline_failed_criteria: this.contract.integer(
                input.baseline_failed_criteria,
                0,
                5120,
            ),
            treatment_failed_criteria: this.contract.integer(
                input.treatment_failed_criteria,
                0,
                5120,
            ),
            baseline_overruns: this.contract.integer(
                input.baseline_overruns,
                0,
                coverage.expected_pairs,
            ),
            treatment_overruns: this.contract.integer(
                input.treatment_overruns,
                0,
                coverage.expected_pairs,
            ),
            runs_with_limitations: this.contract.integer(
                input.runs_with_limitations,
                0,
                coverage.imported_runs,
            ),
            comparability_reasons: [...new Set(reasons)].sort(),
        };
    }

    private version(value: unknown): string | null {
        if (value === null) return null;
        if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(value))
            this.contract.invalid();
        return value as string;
    }
    private choice<T extends string>(value: unknown, values: readonly T[]): T {
        if (!values.includes(value as T)) this.contract.invalid();
        return value as T;
    }
    private list(value: unknown, maximum: number, minimum = 0): unknown[] {
        if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
            this.contract.invalid();
        return value as unknown[];
    }
    private bounded(value: unknown, maximum: number): void {
        try {
            if (Buffer.byteLength(JSON.stringify(value)) > maximum) this.contract.invalid();
            const inspect = (item: unknown): void => {
                if (typeof item === 'string' && /[\u0000-\u001f\u007f]/u.test(item))
                    this.contract.invalid();
                if (Array.isArray(item)) item.forEach(inspect);
                else if (item && typeof item === 'object') Object.values(item).forEach(inspect);
            };
            inspect(value);
        } catch {
            this.contract.invalid();
        }
    }
}
