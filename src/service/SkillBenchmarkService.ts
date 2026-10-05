// SPDX-License-Identifier: Apache-2.0
import { SkillBenchmarkRepository } from '../repository/SkillBenchmarkRepository.ts';
import type {
    BenchmarkCase,
    BenchmarkRun,
    BenchmarkVerdict,
} from '../validator/SkillBenchmarkValidator.ts';

/** Compare retained observations; never execute cases or certify complete skill readiness. */
export class SkillBenchmarkService {
    private readonly repository: SkillBenchmarkRepository;

    constructor(repository = new SkillBenchmarkRepository()) {
        this.repository = repository;
    }

    prepare(suite: string, skillsRoot: string, output: string) {
        return this.repository.prepare(suite, skillsRoot, output);
    }

    importRun(benchmark: string, run: string, artifacts: string) {
        return this.repository.importRun(benchmark, run, artifacts);
    }

    compare(benchmark: string) {
        return this.inspectEvidence(benchmark).comparison;
    }

    inspectEvidence(benchmark: string) {
        const frozen = this.repository.loadEvidence(benchmark);
        const retained = this.repository.retainedRuns(benchmark, frozen);
        const runs = retained.map((entry) => entry.run);
        const after = this.repository.loadEvidence(benchmark);
        if (
            after.manifest_sha256 !== frozen.manifest_sha256 ||
            JSON.stringify(after.suite) !== JSON.stringify(frozen.suite)
        )
            throw new Error('Invalid benchmark: Freeze changed during comparison.');
        return { frozen, retained, comparison: this.comparison(frozen, runs) };
    }

    private comparison(
        frozen: ReturnType<SkillBenchmarkRepository['loadEvidence']>,
        runs: BenchmarkRun[],
    ) {
        const cases = frozen.suite.cases.flatMap((selected) =>
            Array.from({ length: selected.limits.attempts }, (_, index) => {
                const attempt = index + 1;
                const baseline = runs.find(
                    (item) =>
                        item.case_id === selected.id &&
                        item.attempt === attempt &&
                        item.variant === 'baseline',
                );
                const treatment = runs.find(
                    (item) =>
                        item.case_id === selected.id &&
                        item.attempt === attempt &&
                        item.variant === 'treatment',
                );
                return this.pair(selected, attempt, baseline, treatment);
            }),
        );
        const verdicts = cases.map((item) => item.observed_treatment_result);
        const observedTreatmentResult = verdicts.includes('fail')
            ? 'fail'
            : verdicts.every((item) => item === 'pass')
              ? 'pass'
              : 'blocked';
        const result = {
            schema_version: 1,
            suite: frozen.suite.id,
            benchmark_sha256: frozen.manifest.benchmark_sha256,
            packages: frozen.manifest.packages,
            coverage: {
                expected_pairs: cases.length,
                imported_runs: runs.length,
                missing_runs: cases.length * 2 - runs.length,
                paired_cases: cases.filter(
                    (item) => item.baseline_run !== null && item.treatment_run !== null,
                ).length,
                declared_agent_pairs: cases.filter((item) => item.declared_agent_pair).length,
                declared_controlled_agent_pairs: cases.filter(
                    (item) => item.declared_controlled_agent_pair,
                ).length,
                fixture_runs: runs.filter((item) => item.execution.kind === 'fixture').length,
                manual_runs: runs.filter((item) => item.execution.kind === 'manual').length,
                unexecuted_runs: runs.filter((item) => item.execution.status !== 'executed').length,
            },
            observed_treatment_result: observedTreatmentResult,
            comparison_status: cases.every((item) => item.comparison_status === 'complete')
                ? 'complete'
                : 'incomplete',
            cases,
            limits: [
                'Hashes verify retained bytes, not the authenticity of executor, model, context, metrics or grading assertions.',
                'Fixture and manual runs are separate from caller-declared agent executions.',
                'A passing observed case result is not official conformance, publication readiness, causality or population-level quality.',
                'Final-acceptance is a frozen phase label; untouched execution remains an operator assertion.',
                'A single pair is not statistical evidence; no timing, token, cost or provider result is inferred when absent.',
            ],
        };
        if (Buffer.byteLength(JSON.stringify(result)) > 524_288)
            throw new Error('Invalid benchmark: Comparison output exceeds 524288 bytes.');
        return result;
    }

    private pair(
        selected: BenchmarkCase,
        attempt: number,
        baseline?: BenchmarkRun,
        treatment?: BenchmarkRun,
    ) {
        const reasons = this.comparisonReasons(selected, baseline, treatment);
        const declaredAgentPair =
            baseline?.execution.kind === 'agent' &&
            treatment?.execution.kind === 'agent' &&
            baseline.execution.status === 'executed' &&
            treatment.execution.status === 'executed';
        const controlled = Boolean(declaredAgentPair && reasons.length === 0);
        const criteria = selected.criteria.map((criterion) => {
            const before = baseline?.criteria.find((item) => item.id === criterion.id);
            const after = treatment?.criteria.find((item) => item.id === criterion.id);
            const graded =
                before !== undefined &&
                after !== undefined &&
                ['pass', 'fail'].includes(before.verdict) &&
                ['pass', 'fail'].includes(after.verdict);
            let change = 'not-compared';
            if (controlled && graded) {
                change =
                    before.verdict === after.verdict
                        ? 'unchanged'
                        : after.verdict === 'pass'
                          ? 'improved'
                          : 'regressed';
            }
            return {
                id: criterion.id,
                critical: criterion.critical,
                baseline: before ?? null,
                treatment: after ?? null,
                change,
            };
        });
        const completeGrades = criteria.every(
            (item) =>
                item.baseline !== null &&
                item.treatment !== null &&
                ['pass', 'fail'].includes(item.baseline.verdict) &&
                ['pass', 'fail'].includes(item.treatment.verdict),
        );
        return {
            case_id: selected.id,
            phase: selected.phase,
            attempt,
            baseline_run: baseline?.id ?? null,
            treatment_run: treatment?.id ?? null,
            declared_agent_pair: Boolean(declaredAgentPair),
            declared_controlled_agent_pair: controlled,
            comparability_reasons: reasons,
            comparison_status: controlled && completeGrades ? 'complete' : 'incomplete',
            observed_treatment_result: this.result(selected, treatment),
            critical_failures: criteria.flatMap((item) => {
                if (!item.critical) return [];
                const failures = [];
                if (item.baseline?.verdict === 'fail')
                    failures.push({ variant: 'baseline', criterion: item.id });
                if (item.treatment?.verdict === 'fail')
                    failures.push({ variant: 'treatment', criterion: item.id });
                return failures;
            }),
            criteria,
            reported_metrics: {
                baseline: baseline?.metrics ?? null,
                treatment: treatment?.metrics ?? null,
            },
            reported_budget: {
                seconds_limit: selected.limits.seconds,
                baseline_within_limit: this.withinBudget(selected, baseline),
                treatment_within_limit: this.withinBudget(selected, treatment),
            },
            run_limitations: {
                baseline: baseline?.limitations ?? [],
                treatment: treatment?.limitations ?? [],
            },
        };
    }

    private comparisonReasons(
        selected: BenchmarkCase,
        baseline?: BenchmarkRun,
        treatment?: BenchmarkRun,
    ): string[] {
        if (!baseline || !treatment) return ['A baseline/treatment run is missing.'];
        const reasons: string[] = [];
        if (baseline.execution.status !== 'executed' || treatment.execution.status !== 'executed')
            reasons.push('Both arms must have executed.');
        if (baseline.execution.kind !== 'agent' || treatment.execution.kind !== 'agent')
            reasons.push('The pair is not two declared agent executions.');
        if (!baseline.execution.fresh_context || !treatment.execution.fresh_context)
            reasons.push('Fresh independent contexts are not declared for both arms.');
        if (this.withinBudget(selected, baseline) === false)
            reasons.push('Reported baseline wall time exceeds the frozen case limit.');
        if (this.withinBudget(selected, treatment) === false)
            reasons.push('Reported treatment wall time exceeds the frozen case limit.');
        for (const key of ['model', 'environment', 'settings'] as const) {
            const before = baseline.execution[key];
            const after = treatment.execution[key];
            if (!this.known(before) || !this.known(after)) {
                reasons.push(`Comparable ${key} is unknown.`);
                continue;
            }
            if (before !== after) reasons.push(`Declared ${key} differs between arms.`);
        }
        return reasons;
    }

    private withinBudget(selected: BenchmarkCase, run?: BenchmarkRun): boolean | null {
        const duration = run?.metrics.wall_time_ms;
        if (duration === null || duration === undefined) return null;
        return duration <= selected.limits.seconds * 1_000;
    }

    private known(value: string | null): boolean {
        return (
            value !== null &&
            !/^(unknown|unavailable|not[- _]?(known|recorded|available)|n\/a)$/i.test(value.trim())
        );
    }

    private result(selected: BenchmarkCase, run?: BenchmarkRun): BenchmarkVerdict {
        if (!run || run.execution.status === 'not-run') return 'not-run';
        if (run.execution.status !== 'executed') return 'blocked';
        const critical = selected.criteria
            .filter((item) => item.critical)
            .map((item) => run.criteria.find((result) => result.id === item.id)!.verdict);
        if (critical.includes('fail')) return 'fail';
        if (critical.some((item) => item !== 'pass')) return 'blocked';
        return 'pass';
    }
}
