// SPDX-License-Identifier: Apache-2.0
import { SkillBenchmarkService } from './SkillBenchmarkService.ts';
import { SkillQualityValidator } from '../validator/SkillQualityValidator.ts';
import type { SkillQualityReceipt } from '../validator/SkillQualityValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

/** Verify the whole retained benchmark, then derive one package's selected-case receipt. */
export class SkillQualityBenchmarkService {
    private readonly benchmark: SkillBenchmarkService;
    constructor(benchmark = new SkillBenchmarkService()) {
        this.benchmark = benchmark;
    }

    observe(value: SkillQualityReceipt, directory: string): SkillQualityReceipt {
        if (value.payload.kind !== 'behavioral_evaluation')
            throw new SkillOperationError('invalid_input');
        const { frozen, retained, comparison } = this.benchmark.inspectEvidence(directory);
        const subject = frozen.manifest.packages.find((item) => item.name === value.payload.skill);
        if (!subject || subject.tree_sha256 !== value.payload.source.package_sha256)
            throw new SkillOperationError('invalid_input');
        const selected = frozen.suite.cases.filter((item) =>
            item.skills.includes(value.payload.skill),
        );
        const ids = new Set(selected.map((item) => item.id));
        const pairs = comparison.cases.filter((item) => ids.has(item.case_id));
        const entries = retained.filter((item) => ids.has(item.run.case_id));
        const runs = entries.map((item) => item.run);
        const treatmentRuns = runs.filter((item) => item.variant === 'treatment');
        const expected = pairs.length;
        const treatment = {
            expected,
            executed: treatmentRuns.filter((item) => item.execution.status === 'executed').length,
            blocked: treatmentRuns.filter((item) => item.execution.status === 'blocked').length,
            not_run: treatmentRuns.filter((item) => item.execution.status === 'not-run').length,
            missing: expected - treatmentRuns.length,
            passed: pairs.filter((item) => item.observed_treatment_result === 'pass').length,
            failed: pairs.filter((item) => item.observed_treatment_result === 'fail').length,
            unresolved: pairs.filter(
                (item) =>
                    item.observed_treatment_result === 'blocked' &&
                    treatmentRuns.some(
                        (run) =>
                            run.id === item.treatment_run && run.execution.status === 'executed',
                    ),
            ).length,
        };
        const result =
            treatment.failed > 0
                ? 'fail'
                : treatment.passed === expected
                  ? 'pass'
                  : treatment.not_run + treatment.missing === expected
                    ? 'not-run'
                    : 'blocked';
        const receipt = {
            ...value,
            payload: {
                ...value.payload,
                assurance: 'verified_retained_benchmark',
                method: {
                    name: 'retained-benchmark-comparison',
                    version: '1',
                    revision: null,
                    source_sha256: null,
                },
                result,
                coverage: {
                    expected_pairs: expected,
                    imported_runs: runs.length,
                    missing_runs: expected * 2 - runs.length,
                    paired_cases: pairs.filter(
                        (item) => item.baseline_run !== null && item.treatment_run !== null,
                    ).length,
                    declared_agent_pairs: pairs.filter((item) => item.declared_agent_pair).length,
                    declared_controlled_agent_pairs: pairs.filter(
                        (item) => item.declared_controlled_agent_pair,
                    ).length,
                    fixture_runs: runs.filter((item) => item.execution.kind === 'fixture').length,
                    manual_runs: runs.filter((item) => item.execution.kind === 'manual').length,
                    unexecuted_runs: runs.filter((item) => item.execution.status !== 'executed')
                        .length,
                    critical_failures: pairs.reduce(
                        (sum, item) => sum + item.critical_failures.length,
                        0,
                    ),
                    treatment_critical_failures: pairs.reduce(
                        (sum, item) =>
                            sum +
                            item.critical_failures.filter(
                                (failure) => failure.variant === 'treatment',
                            ).length,
                        0,
                    ),
                    comparison_status: pairs.every((item) => item.comparison_status === 'complete')
                        ? 'complete'
                        : 'incomplete',
                    selected_cases: selected.map((item) => ({
                        case_id: item.id,
                        phase: item.phase,
                        attempts: item.limits.attempts,
                        joint_workflow: item.skills.length > 1,
                    })),
                    treatment,
                },
                artifacts: [
                    {
                        locator: 'manifest.json',
                        sha256: frozen.manifest_sha256,
                        scope: 'benchmark_manifest',
                    },
                    ...entries.map((item) => ({
                        locator: 'runs/' + item.run.id + '/run.json',
                        sha256: item.run_sha256,
                        scope: 'benchmark_run',
                    })),
                ],
                limitations: value.payload.limitations.filter(
                    (item) => item !== 'caller_assertion',
                ),
                benchmark: {
                    suite: frozen.suite.id,
                    benchmark_sha256: frozen.manifest.benchmark_sha256,
                    scope: 'selected_package_cases',
                    suite_comparison_status: comparison.comparison_status,
                    suite_observed_treatment_result: comparison.observed_treatment_result,
                    result_basis: 'critical_treatment_criteria',
                    baseline_failed_criteria: pairs.reduce(
                        (sum, item) =>
                            sum +
                            item.criteria.filter(
                                (criterion) => criterion.baseline?.verdict === 'fail',
                            ).length,
                        0,
                    ),
                    treatment_failed_criteria: pairs.reduce(
                        (sum, item) =>
                            sum +
                            item.criteria.filter(
                                (criterion) => criterion.treatment?.verdict === 'fail',
                            ).length,
                        0,
                    ),
                    baseline_overruns: pairs.filter(
                        (item) => item.reported_budget.baseline_within_limit === false,
                    ).length,
                    treatment_overruns: pairs.filter(
                        (item) => item.reported_budget.treatment_within_limit === false,
                    ).length,
                    runs_with_limitations: runs.filter((item) => item.limitations.length > 0)
                        .length,
                    comparability_reasons: [
                        ...new Set(pairs.flatMap((item) => item.comparability_reasons)),
                    ]
                        .map((reason) => this.reason(reason))
                        .sort(),
                },
            },
        };
        return new SkillQualityValidator().receipt(receipt);
    }

    private reason(reason: string): string {
        const reasons: Record<string, string> = {
            'A baseline/treatment run is missing.': 'missing_arm',
            'Both arms must have executed.': 'unexecuted_arm',
            'The pair is not two declared agent executions.': 'non_agent_pair',
            'Fresh independent contexts are not declared for both arms.':
                'fresh_context_unasserted',
            'Reported baseline wall time exceeds the frozen case limit.': 'baseline_overrun',
            'Reported treatment wall time exceeds the frozen case limit.': 'treatment_overrun',
        };
        for (const key of ['model', 'environment', 'settings']) {
            reasons['Comparable ' + key + ' is unknown.'] = key + '_unknown';
            reasons['Declared ' + key + ' differs between arms.'] = key + '_different';
        }
        const code = reasons[reason];
        if (!code) throw new SkillOperationError('invalid_input');
        return code;
    }
}
