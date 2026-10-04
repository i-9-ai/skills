// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillQualityValidator } from '../../../src/validator/SkillQualityValidator.ts';
import { assertion, behavioral, query, reversed } from '../fixture/SkillQualityFixture.mjs';

test('caller record normalizes closed metadata and cannot choose observed assurance', () => {
    const validator = new SkillQualityValidator();
    const value = assertion();
    const receipt = validator.assertion(value);
    assert.equal(receipt.payload.assurance, 'caller_assertion');
    assert.ok(receipt.payload.limitations.includes('caller_assertion'));
    assert.equal(JSON.stringify(receipt), JSON.stringify(validator.assertion(reversed(value))));
    assert.deepEqual(validator.receipt(receipt), receipt);
    for (const assurance of [
        'caller_assertion',
        'locally_observed_official_process',
        'verified_retained_benchmark',
    ])
        assert.throws(
            () => validator.assertion({ ...value, payload: { ...value.payload, assurance } }),
            (error) => error.code === 'invalid_input',
        );
    assert.throws(
        () =>
            validator.assertion({ ...value, payload: { ...value.payload, prompt: 'raw source' } }),
        (error) => error.code === 'invalid_input',
    );
});

test('official pass/fail/blocked/not-run results cannot contradict process coverage assertions', () => {
    const validator = new SkillQualityValidator();
    for (const [result, coverage] of [
        ['pass', { executed: 1, passed: 1, failed: 0, blocked: 0, not_run: 0 }],
        ['fail', { executed: 1, passed: 0, failed: 1, blocked: 0, not_run: 0 }],
        ['blocked', { executed: 0, passed: 0, failed: 0, blocked: 1, not_run: 0 }],
        ['not-run', { executed: 0, passed: 0, failed: 0, blocked: 0, not_run: 1 }],
    ]) {
        const value = assertion();
        value.payload.result = result;
        value.payload.coverage = { selected_packages: 1, ...coverage };
        assert.equal(validator.assertion(value).payload.result, result);
        value.payload.result = result === 'pass' ? 'fail' : 'pass';
        assert.throws(
            () => validator.assertion(value),
            (error) => error.code === 'invalid_input',
        );
    }
});

test('behavioral caller assertions preserve missing, failed, unexecuted and joint coverage limits', () => {
    const validator = new SkillQualityValidator();
    const complete = behavioral();
    complete.payload.coverage.critical_failures = 1; // Baseline critical failure can coexist with a passing treatment.
    assert.equal(validator.assertion(complete).payload.result, 'pass');
    const missing = behavioral();
    Object.assign(missing.payload.coverage, {
        imported_runs: 0,
        missing_runs: 2,
        paired_cases: 0,
        declared_agent_pairs: 0,
        declared_controlled_agent_pairs: 0,
        comparison_status: 'incomplete',
    });
    Object.assign(missing.payload.coverage.treatment, { executed: 0, missing: 1, passed: 0 });
    missing.payload.result = 'not-run';
    missing.payload.coverage.selected_cases[0].joint_workflow = true;
    const receipt = validator.assertion(missing);
    assert.ok(receipt.payload.limitations.includes('comparison_incomplete'));
    assert.ok(receipt.payload.limitations.includes('joint_workflow'));
    assert.equal(receipt.payload.coverage.missing_runs, 2);
    missing.payload.result = 'pass';
    assert.throws(
        () => validator.assertion(missing),
        (error) => error.code === 'invalid_input',
    );
    const failed = behavioral();
    failed.payload.result = 'fail';
    Object.assign(failed.payload.coverage.treatment, { passed: 0, failed: 1 });
    Object.assign(failed.payload.coverage, {
        critical_failures: 1,
        treatment_critical_failures: 1,
    });
    assert.equal(validator.assertion(failed).payload.result, 'fail');
});

test('incomplete comparisons retain passing treatments with missing, unexecuted and non-agent baselines', () => {
    const validator = new SkillQualityValidator();
    for (const coverage of [
        { imported_runs: 1, missing_runs: 1, paired_cases: 0, declared_agent_pairs: 0 },
        { unexecuted_runs: 1, declared_agent_pairs: 0 },
        { fixture_runs: 2, declared_agent_pairs: 0 },
        { manual_runs: 2, declared_agent_pairs: 0 },
        { fixture_runs: 1, unexecuted_runs: 1, declared_agent_pairs: 0 },
        { manual_runs: 1, unexecuted_runs: 1, declared_agent_pairs: 0 },
        {},
    ]) {
        const value = behavioral();
        Object.assign(value.payload.coverage, {
            comparison_status: 'incomplete',
            declared_controlled_agent_pairs: 0,
            ...coverage,
        });
        const receipt = validator.assertion(value);
        assert.equal(receipt.payload.result, 'pass');
        assert.equal(receipt.payload.coverage.comparison_status, 'incomplete');
        assert.ok(receipt.payload.limitations.includes('comparison_incomplete'));
    }
});

test('imported fixture and manual classifications include unexecuted arms', () => {
    const validator = new SkillQualityValidator();
    const value = behavioral();
    Object.assign(value.payload.coverage, {
        comparison_status: 'incomplete',
        declared_agent_pairs: 0,
        declared_controlled_agent_pairs: 0,
        fixture_runs: 1,
        manual_runs: 1,
        unexecuted_runs: 2,
    });
    Object.assign(value.payload.coverage.treatment, { executed: 0, blocked: 1, passed: 0 });
    value.payload.result = 'blocked';
    const receipt = validator.assertion(value);
    assert.equal(receipt.payload.result, 'blocked');
    assert.equal(receipt.payload.coverage.fixture_runs, 1);
    assert.equal(receipt.payload.coverage.manual_runs, 1);
    assert.equal(receipt.payload.coverage.unexecuted_runs, 2);
});

test('incomplete coverage cannot invent executed treatments or executed agent pairs', () => {
    const validator = new SkillQualityValidator();
    for (const [name, coverage] of [
        ['review counterexample', { unexecuted_runs: 2 }],
        ['treatment exceeds all executed runs', { unexecuted_runs: 2, declared_agent_pairs: 0 }],
        ['agent pair lacks an executed baseline', { unexecuted_runs: 1 }],
        ['fixture arms cannot form an agent pair', { fixture_runs: 2 }],
        ['manual arm cannot form an agent pair', { manual_runs: 1 }],
    ]) {
        const value = behavioral();
        Object.assign(value.payload.coverage, {
            comparison_status: 'incomplete',
            declared_controlled_agent_pairs: 0,
            ...coverage,
        });
        assert.throws(
            () => validator.assertion(value),
            (error) => error.code === 'invalid_input',
            name,
        );
    }
});

test('paired counts require possible baseline and treatment arm allocations', () => {
    const validator = new SkillQualityValidator();
    for (const [name, imported, paired, treatmentMissing] of [
        ['two treatment runs do not make one pair', 2, 1, 0],
        ['three imported runs in two slots require a pair', 3, 0, 0],
        ['two baseline runs cannot pair with missing treatments', 2, 1, 2],
    ]) {
        const value = behavioral();
        Object.assign(value.payload.coverage, {
            expected_pairs: 2,
            imported_runs: imported,
            missing_runs: 4 - imported,
            paired_cases: paired,
            declared_agent_pairs: 0,
            declared_controlled_agent_pairs: 0,
            comparison_status: 'incomplete',
        });
        value.payload.coverage.selected_cases[0].attempts = 2;
        Object.assign(value.payload.coverage.treatment, {
            expected: 2,
            executed: 2 - treatmentMissing,
            passed: 2 - treatmentMissing,
            missing: treatmentMissing,
        });
        value.payload.result = treatmentMissing === 2 ? 'not-run' : 'pass';
        assert.throws(
            () => validator.assertion(value),
            (error) => error.code === 'invalid_input',
            name,
        );
    }
    const valid = behavioral();
    Object.assign(valid.payload.coverage, {
        expected_pairs: 2,
        imported_runs: 3,
        missing_runs: 1,
        declared_controlled_agent_pairs: 0,
        comparison_status: 'incomplete',
    });
    valid.payload.coverage.selected_cases[0].attempts = 2;
    Object.assign(valid.payload.coverage.treatment, { expected: 2, executed: 2, passed: 2 });
    assert.equal(validator.assertion(valid).payload.result, 'pass');
});

test('closed locators, method values, query period, cursor scope and input sizes are bounded', () => {
    const validator = new SkillQualityValidator();
    for (const change of [
        (value) =>
            (value.payload.artifacts[0].locator = ['', 'synthetic', 'result.json'].join('/')),
        (value) => (value.payload.artifacts[0].locator = '../result.json'),
        (value) => (value.payload.method.version = ['', 'synthetic', 'version'].join('/')),
        (value) => (value.payload.method.version = '0.1.0\n'),
        (value) => (value.payload.source.package_sha256 += '\n'),
        (value) => value.payload.limitations.push('unrecognized'),
        (value) => value.payload.artifacts.push(value.payload.artifacts[0]),
    ]) {
        const value = assertion();
        change(value);
        assert.throws(
            () => validator.assertion(value),
            (error) => error.code === 'invalid_input',
        );
    }
    assert.throws(
        () => validator.query({ ...query, until: '2028-10-01T00:00:00.000Z' }),
        (error) => error.code === 'invalid_input',
    );
    assert.throws(
        () => validator.query({ ...query, limit: 101 }),
        (error) => error.code === 'invalid_input',
    );
    const normalized = validator.query(query);
    const cursor = validator.cursor(normalized, validator.assertion(assertion()));
    assert.ok(validator.query({ ...query, after: cursor }).after);
    assert.throws(
        () => validator.query({ ...query, collection: 'another', after: cursor }),
        (error) => error.code === 'invalid_input',
    );
    assert.throws(
        () => validator.query({ ...query, after: 'x'.repeat(5000) }),
        (error) => error.code === 'invalid_input',
    );
});
