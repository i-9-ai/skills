// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SkillBenchmarkService } from '../../../src/service/SkillBenchmarkService.ts';
import { fixture, run, importRun } from '../fixture/SkillBenchmarkFixture.mjs';

const service = new SkillBenchmarkService();
const prepare = (target) => service.prepare(target.suiteFile, target.skills, target.output);

test('no imported execution stays incomplete and reports real missing denominators', (t) => {
    const target = fixture(t);
    prepare(target);
    const before = fs.readFileSync(path.join(target.output, 'manifest.json'));
    const result = service.compare(target.output);
    assert.equal(result.comparison_status, 'incomplete');
    assert.equal(result.observed_treatment_result, 'blocked');
    assert.equal(result.coverage.missing_runs, 2);
    assert.equal(result.coverage.declared_agent_pairs, 0);
    assert.equal(result.cases[0].observed_treatment_result, 'not-run');
    assert.deepEqual(fs.readFileSync(path.join(target.output, 'manifest.json')), before);
    assert.deepEqual(fs.readdirSync(path.join(target.output, 'runs')), []);
});

test('fixture or manual pairs never become controlled agent comparisons', (t) => {
    for (const kind of ['fixture', 'manual']) {
        const target = fixture(t);
        const frozen = prepare(target);
        for (const variant of ['baseline', 'treatment']) {
            const value = run(target, frozen, variant);
            value.execution.kind = kind;
            importRun(service, target, value);
        }
        const result = service.compare(target.output);
        assert.equal(result.observed_treatment_result, 'pass');
        assert.equal(result.comparison_status, 'incomplete');
        assert.equal(result.coverage.declared_agent_pairs, 0);
        assert.equal(result.coverage[`${kind}_runs`], 2);
        assert.equal(result.cases[0].criteria[0].change, 'not-compared');
        assert.deepEqual(result.cases[0].reported_metrics.baseline, {
            wall_time_ms: null,
            input_tokens: null,
            output_tokens: null,
        });
    }
});

test('equal unknown model or environment and nonfresh contexts cannot establish comparability', (t) => {
    for (const [key, value] of [
        ['model', null],
        ['model', 'unknown'],
        ['environment', null],
        ['settings', null],
        ['fresh_context', false],
    ]) {
        const target = fixture(t);
        const frozen = prepare(target);
        for (const variant of ['baseline', 'treatment']) {
            const record = run(target, frozen, variant);
            record.execution.kind = 'agent';
            record.execution[key] = value;
            importRun(service, target, record);
        }
        const result = service.compare(target.output);
        assert.equal(result.coverage.declared_agent_pairs, 1);
        assert.equal(result.coverage.declared_controlled_agent_pairs, 0);
        assert.equal(result.comparison_status, 'incomplete');
        assert.ok(result.cases[0].comparability_reasons.length > 0);
    }
});

test('critical failure stays visible despite the remaining passing criteria', (t) => {
    const target = fixture(t);
    const frozen = prepare(target);
    const baseline = run(target, frozen, 'baseline');
    const treatment = run(target, frozen, 'treatment');
    baseline.execution.kind = 'agent';
    treatment.execution.kind = 'agent';
    treatment.criteria[0].verdict = 'fail';
    treatment.criteria[0].reason = 'Synthetic critical regression.';
    importRun(service, target, baseline);
    importRun(service, target, treatment);
    const result = service.compare(target.output);
    assert.equal(result.comparison_status, 'complete');
    assert.equal(result.observed_treatment_result, 'fail');
    assert.deepEqual(result.cases[0].critical_failures, [
        { variant: 'treatment', criterion: 'authority' },
    ]);
    assert.equal(result.cases[0].criteria[0].change, 'regressed');
    assert.equal(result.cases[0].criteria[1].change, 'unchanged');
    assert.deepEqual(result.cases[0].reported_metrics.treatment, {
        wall_time_ms: null,
        input_tokens: null,
        output_tokens: null,
    });
});

test('a blocked case does not become a failed or successful observed execution', (t) => {
    const target = fixture(t);
    const frozen = prepare(target);
    const value = run(target, frozen);
    value.execution.status = 'blocked';
    value.criteria = value.criteria.map((criterion) => ({
        ...criterion,
        verdict: 'blocked',
        evidence: [],
    }));
    importRun(service, target, value);
    const result = service.compare(target.output);
    assert.equal(result.observed_treatment_result, 'blocked');
    assert.equal(result.coverage.unexecuted_runs, 1);
    assert.deepEqual(result.cases[0].critical_failures, []);
    value.id = 'dishonest-success';
    value.criteria[0].verdict = 'pass';
    value.criteria[0].evidence = ['report.md'];
    assert.throws(() => importRun(service, target, value), /Unexecuted/);
});

test('reported budget overruns remain inspectable but cannot establish a controlled comparison', (t) => {
    const target = fixture(t);
    const frozen = prepare(target);
    const baseline = run(target, frozen, 'baseline');
    const treatment = run(target, frozen, 'treatment');
    baseline.execution.kind = 'agent';
    treatment.execution.kind = 'agent';
    baseline.metrics.wall_time_ms = 120_000;
    treatment.metrics.wall_time_ms = 120_001;
    importRun(service, target, baseline);
    importRun(service, target, treatment);
    const result = service.compare(target.output);
    assert.equal(result.observed_treatment_result, 'pass');
    assert.equal(result.comparison_status, 'incomplete');
    assert.equal(result.coverage.declared_controlled_agent_pairs, 0);
    assert.deepEqual(result.cases[0].reported_budget, {
        seconds_limit: 120,
        baseline_within_limit: true,
        treatment_within_limit: false,
    });
    assert.match(result.cases[0].comparability_reasons.join(' '), /wall time exceeds/);
});
