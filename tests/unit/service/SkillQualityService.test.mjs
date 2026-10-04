// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { SkillQualityService } from '../../../src/service/SkillQualityService.ts';
import { SkillQualityRepository } from '../../../src/repository/SkillQualityRepository.ts';
import { SkillEvidenceDatabaseRepository } from '../../../src/repository/SkillEvidenceDatabaseRepository.ts';
import { SkillPackageRevisionRepository } from '../../../src/repository/SkillPackageRevisionRepository.ts';
import { SkillBenchmarkService } from '../../../src/service/SkillBenchmarkService.ts';
import { SkillMemoryService } from '../../../src/service/SkillMemoryService.ts';
import { TelemetryInputRepository } from '../../../src/repository/TelemetryInputRepository.ts';
import {
    assertion,
    behavioral,
    query,
    fixture as qualityFixture,
    reversed,
} from '../fixture/SkillQualityFixture.mjs';
import { fixture, run, importRun, write } from '../fixture/SkillBenchmarkFixture.mjs';
import { createIssuedDatabase } from '../fixture/IssuedSkillEvidenceMigration.mjs';

const hasCode = (code) => (error) => error?.code === code;

test('recordFile preserves valid JSON at every reserved SQLite path before any writer effects', async (t) => {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const target = qualityFixture(t);
        const input = target.database + suffix;
        const bytes = Buffer.from(JSON.stringify(assertion()));
        fs.writeFileSync(input, bytes);
        const before = fs.statSync(input);
        const listing = fs.readdirSync(target.root);
        let calls = 0;
        await assert.rejects(
            new SkillQualityService([]).recordFile(() => {
                calls++;
                return target.database;
            }, input),
            hasCode('invalid_input'),
        );
        assert.equal(calls, 1, suffix);
        assert.deepEqual(fs.readdirSync(target.root), listing, suffix);
        assert.deepEqual(fs.readFileSync(input), bytes, suffix);
        const after = fs.statSync(input);
        for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'])
            assert.equal(after[key], before[key], `${suffix}:${key}`);
    }
});

test('recordFile rejects database parent aliases and linked input files without changing source bytes', async (t) => {
    for (const kind of ['database-parent-link', 'input-link', 'input-hardlink']) {
        const target = qualityFixture(t);
        const input = path.join(target.root, 'request.json');
        const bytes = Buffer.from(JSON.stringify(assertion()));
        fs.writeFileSync(input, bytes);
        let file = input;
        let database = path.join(target.root, 'absent', 'evidence.db');
        if (kind === 'database-parent-link') {
            const alias = path.join(target.root, 'alias');
            fs.symlinkSync(target.root, alias, 'dir');
            database = path.join(alias, 'request.json');
        } else {
            file = path.join(target.root, 'linked-request.json');
            if (kind === 'input-link') fs.symlinkSync(input, file);
            else fs.linkSync(input, file);
        }
        const listing = fs.readdirSync(target.root);
        await assert.rejects(
            new SkillQualityService([]).recordFile(database, file),
            hasCode('invalid_input'),
        );
        assert.deepEqual(fs.readdirSync(target.root), listing, kind);
        assert.deepEqual(fs.readFileSync(input), bytes, kind);
        assert.equal(fs.existsSync(path.join(target.root, 'absent')), false, kind);
    }
});

test('recordFile rechecks retained input identity after one selector call and before directory creation', async (t) => {
    for (const change of ['replacement', 'bytes', 'parent']) {
        const target = qualityFixture(t);
        const directory = path.join(target.root, 'inputs');
        fs.mkdirSync(directory);
        const input = path.join(directory, 'request.json');
        fs.writeFileSync(input, JSON.stringify(assertion()));
        const database = path.join(target.root, 'untouched', 'evidence.db');
        let calls = 0;
        await assert.rejects(
            new SkillQualityService([]).recordFile(() => {
                calls++;
                if (change === 'replacement') {
                    fs.renameSync(input, input + '.old');
                    fs.writeFileSync(input, 'replacement sentinel');
                }
                if (change === 'bytes') fs.appendFileSync(input, '\nchanged sentinel');
                if (change === 'parent') {
                    fs.renameSync(directory, directory + '.old');
                    fs.mkdirSync(directory);
                    fs.writeFileSync(input, 'replacement parent sentinel');
                }
                return database;
            }, input),
            hasCode('invalid_input'),
        );
        assert.equal(calls, 1, change);
        assert.equal(fs.existsSync(path.dirname(database)), false, change);
        assert.match(fs.readFileSync(input, 'utf8'), /sentinel/, change);
    }
});

test('recordFile validates metadata and complete retained evidence before resolving storage', async (t) => {
    const target = selected(t);
    const input = path.join(target.root, 'request.json');
    let calls = 0;
    const database = () => {
        calls++;
        return target.database;
    };
    fs.writeFileSync(input, JSON.stringify({ invalid: true }));
    await assert.rejects(target.service.recordFile(database, input), hasCode('invalid_input'));
    fs.writeFileSync(input, JSON.stringify(target.value));
    fs.appendFileSync(path.join(target.output, 'manifest.json'), 'tamper');
    await assert.rejects(
        target.service.recordFile(database, input, { benchmark: target.output }),
        hasCode('invalid_input'),
    );
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.dirname(target.database)), false);
});

test('recordFile protects the input on the verified retained benchmark persistence route', async (t) => {
    const target = selected(t);
    fs.mkdirSync(path.dirname(target.database));
    const input = target.database + '-journal';
    const bytes = Buffer.from(JSON.stringify(target.value));
    fs.writeFileSync(input, bytes);
    await assert.rejects(
        target.service.recordFile(target.database, input, { benchmark: target.output }),
        hasCode('invalid_input'),
    );
    assert.deepEqual(fs.readFileSync(input), bytes);
    assert.equal(fs.existsSync(target.database), false);
    assert.deepEqual(fs.readdirSync(path.dirname(target.database)), ['evidence.db-journal']);
});

test('recordFile supports a relative input and safely creates missing database parents after validation', async (t) => {
    const target = qualityFixture(t);
    const input = path.join(target.root, 'request.json');
    const bytes = Buffer.from(JSON.stringify(assertion()));
    fs.writeFileSync(input, bytes);
    const database = path.join(target.root, 'new', 'nested', 'evidence.db');
    let calls = 0;
    const service = new SkillQualityService([]);
    const result = await service.recordFile(
        () => {
            calls++;
            return database;
        },
        path.relative(process.cwd(), input),
    );
    assert.equal(calls, 1);
    assert.equal(result.recorded, true);
    assert.equal(service.inspect(database, query).matching_receipts, 1);
    assert.deepEqual(fs.readFileSync(input), bytes);
});

test('recordFile allows safe sibling JSON and stdin without reserving their parent directories', async (t) => {
    const target = qualityFixture(t);
    const service = new SkillQualityService([]);
    const input = path.join(target.root, 'request.json');
    const value = assertion();
    const bytes = Buffer.from(JSON.stringify(value));
    fs.writeFileSync(input, bytes);
    assert.equal((await service.recordFile(target.database, input)).recorded, true);
    assert.deepEqual(fs.readFileSync(input), bytes);
    const next = assertion();
    t.mock.method(TelemetryInputRepository.prototype, 'read', async (file, stream, limit) => {
        assert.equal(file, '-');
        assert.equal(stream, process.stdin);
        assert.equal(limit, 16_384);
        return next;
    });
    assert.equal((await service.recordFile(target.database, '-')).recorded, true);
    assert.equal(service.inspect(target.database, query).matching_receipts, 2);
    assert.deepEqual(fs.readFileSync(input), bytes);
});

function selected(t, mutate = () => {}) {
    const target = fixture(t);
    const caller = path.join(target.root, 'caller');
    fs.mkdirSync(caller);
    const database = path.join(target.root, 'state', 'evidence.db');
    const service = new SkillQualityService([caller]);
    const benchmark = new SkillBenchmarkService();
    mutate(target);
    const freeze = benchmark.prepare(target.suiteFile, target.skills, target.output);
    const value = behavioral();
    value.payload.source.package_sha256 = freeze.packages[0].tree_sha256;
    return { ...target, caller, database, service, benchmark, freeze, value };
}

test('pure metadata stays caller_assertion; revision selection checks all inert bytes without executing scripts', (t) => {
    const target = selected(t);
    const inspected = new SkillPackageRevisionRepository().inspect(
        path.join(target.skills, 'example-skill'),
    );
    assert.equal(inspected.package_sha256, target.freeze.packages[0].tree_sha256);
    assert.equal(inspected.files, 3);
    const result = target.service.record(target.database, {
        receipt: target.value,
        package_root: path.join(target.skills, 'example-skill'),
    });
    assert.equal(result.assurance, 'caller_assertion');
    const before = fs.readFileSync(target.database);
    assert.equal(
        target.service.record(target.database, { receipt: reversed(target.value) }).recorded,
        false,
    );
    const response = target.service.inspect(target.database, query);
    assert.equal(response.rows[0].receipt.payload.assurance, 'caller_assertion');
    assert.deepEqual(fs.readFileSync(target.database), before);
    fs.appendFileSync(
        path.join(target.skills, 'example-skill', 'scripts', 'inert.mjs'),
        '// byte change\n',
    );
    assert.throws(
        () =>
            target.service.record(path.join(target.root, 'missing', 'bad.db'), {
                receipt: target.value,
                package_root: path.join(target.skills, 'example-skill'),
            }),
        hasCode('invalid_input'),
    );
    assert.equal(fs.existsSync(path.join(target.root, 'missing')), false);
});

test('supplied assurance, wrong selection kind and malformed input never resolve database selectors', (t) => {
    const target = selected(t);
    let calls = 0;
    const database = () => {
        calls++;
        return target.database;
    };
    const value = assertion();
    value.payload.assurance = 'locally_observed_official_process';
    assert.throws(
        () => target.service.record(database, { receipt: value }),
        hasCode('invalid_input'),
    );
    assert.throws(
        () => target.service.record(database, { receipt: assertion(), benchmark: target.output }),
        hasCode('invalid_input'),
    );
    assert.throws(
        () =>
            target.service.record(database, {
                receipt: assertion(),
                assurance: 'caller_assertion',
            }),
        hasCode('invalid_input'),
    );
    assert.throws(
        () => target.service.inspect(database, { ...query, from: 'yesterday' }),
        hasCode('invalid_input'),
    );
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.dirname(target.database)), false);
});

test('caller, installed and selected source roots remain protected for explicit database paths', (t) => {
    const target = selected(t);
    for (const protectedRoot of [target.caller, target.skills, target.output]) {
        const service = new SkillQualityService([target.caller, target.skills]);
        assert.throws(
            () =>
                service.record(path.join(protectedRoot, 'state', 'evidence.db'), {
                    receipt: target.value,
                    benchmark: target.output,
                }),
            hasCode('storage_unavailable'),
        );
        assert.equal(fs.existsSync(path.join(protectedRoot, 'state')), false);
    }
    const link = path.join(target.root, 'linked');
    fs.symlinkSync(target.caller, link, 'dir');
    assert.throws(
        () =>
            target.service.record(path.join(link, 'state', 'evidence.db'), {
                receipt: target.value,
            }),
        hasCode('storage_unavailable'),
    );
    assert.equal(fs.existsSync(path.join(target.caller, 'state')), false);
});

test('read-only missing/schema-3 queries create no files and never upgrade issued data', (t) => {
    const target = qualityFixture(t);
    const service = new SkillQualityService([]);
    const missing = path.join(target.root, 'missing', 'evidence.db');
    assert.throws(() => service.inspect(missing, query), hasCode('storage_unavailable'));
    assert.equal(fs.existsSync(path.dirname(missing)), false);
    const db = createIssuedDatabase(target.database, 3);
    db.close();
    const bytes = fs.readFileSync(target.database);
    assert.throws(
        () => service.inspect(target.database, query),
        hasCode('schema_upgrade_required'),
    );
    assert.deepEqual(fs.readFileSync(target.database), bytes);
});

test('observation persistence rejects JSON and unregistered capabilities', (t) => {
    const target = qualityFixture(t);
    const connection = new SkillEvidenceDatabaseRepository(target.database);
    t.after(() => connection.close());
    const repository = new SkillQualityRepository(connection);
    assert.throws(() => repository.recordObservation({}), hasCode('invalid_input'));
    const guarded = new SkillQualityRepository(connection, undefined, () => {
        throw new Error('unknown capability');
    });
    assert.throws(() => guarded.recordObservation({ receipt: assertion() }), /unknown capability/);
    assert.equal(
        connection.database.prepare('SELECT count(*) AS count FROM quality_receipts').get().count,
        0,
    );
});

test('retained benchmark uses complete verification and records actual manifest/run hashes without detached summary trust', (t) => {
    const target = selected(t);
    for (const variant of ['baseline', 'treatment'])
        importRun(target.benchmark, target, run(target, target.freeze, variant));
    const result = target.service.record(target.database, {
        receipt: target.value,
        benchmark: target.output,
    });
    assert.equal(result.assurance, 'verified_retained_benchmark');
    const observed = target.service.inspect(target.database, query).rows[0].receipt;
    assert.equal(observed.payload.result, 'pass');
    assert.equal(observed.payload.coverage.fixture_runs, 2);
    assert.equal(observed.payload.coverage.comparison_status, 'incomplete');
    assert.equal(observed.payload.artifacts.length, 3);
    assert.equal(observed.payload.benchmark.runs_with_limitations, 2);
    for (const code of [
        'fixture_evidence',
        'comparison_incomplete',
        'grading_asserted',
        'executor_asserted',
        'metrics_asserted',
        'retained_run_limitations',
        'source_identity_asserted',
        'acceptance_is_phase_label',
    ])
        assert.ok(observed.payload.limitations.includes(code), code);
    assert.equal(observed.payload.limitations.includes('caller_assertion'), false);
    assert.equal(JSON.stringify(observed).includes(target.root), false);
    assert.equal(
        target.service.record(target.database, {
            receipt: reversed(target.value),
            benchmark: target.output,
        }).recorded,
        false,
    );
    assert.throws(
        () => target.service.record(target.database, { receipt: observed }),
        hasCode('invalid_input'),
    );
    fs.appendFileSync(
        path.join(target.output, 'runs', 'treatment-one', 'artifacts', 'report.md'),
        'tamper',
    );
    assert.throws(() =>
        target.service.record(path.join(target.root, 'no-store', 'bad.db'), {
            receipt: target.value,
            benchmark: target.output,
        }),
    );
    assert.equal(fs.existsSync(path.join(target.root, 'no-store')), false);
});

test('missing and blocked treatment coverage are honest; failures survive passing noncritical criteria', (t) => {
    const target = selected(t);
    let receipt;
    target.service.record(target.database, { receipt: target.value, benchmark: target.output });
    receipt = target.service.inspect(target.database, query).rows[0].receipt;
    assert.equal(receipt.payload.result, 'not-run');
    assert.equal(receipt.payload.coverage.missing_runs, 2);
    assert.ok(receipt.payload.benchmark.comparability_reasons.includes('missing_arm'));
    const failed = run(target, target.freeze, 'treatment');
    failed.criteria[0].verdict = 'fail';
    importRun(target.benchmark, target, failed);
    const next = behavioral();
    next.payload.source = target.value.payload.source;
    target.service.record(target.database, { receipt: next, benchmark: target.output });
    receipt = target.service
        .inspect(target.database, query)
        .rows.find((item) => item.receipt.event_id === next.event_id).receipt;
    assert.equal(receipt.payload.result, 'fail');
    assert.equal(receipt.payload.coverage.treatment_critical_failures, 1);
    assert.equal(receipt.payload.coverage.missing_runs, 1);
    assert.equal(receipt.payload.coverage.comparison_status, 'incomplete');
});

test('verified agent metadata retains overruns and unknown comparisons without calling them controlled', (t) => {
    const target = selected(t);
    for (const variant of ['baseline', 'treatment']) {
        const value = run(target, target.freeze, variant);
        value.execution.kind = 'agent';
        value.execution.model = 'unknown';
        value.metrics.wall_time_ms = 121000;
        importRun(target.benchmark, target, value);
    }
    target.service.record(target.database, { receipt: target.value, benchmark: target.output });
    const receipt = target.service.inspect(target.database, query).rows[0].receipt;
    assert.equal(receipt.payload.result, 'pass');
    assert.equal(receipt.payload.coverage.declared_agent_pairs, 1);
    assert.equal(receipt.payload.coverage.declared_controlled_agent_pairs, 0);
    assert.equal(receipt.payload.benchmark.baseline_overruns, 1);
    assert.equal(receipt.payload.benchmark.treatment_overruns, 1);
    assert.deepEqual(receipt.payload.benchmark.comparability_reasons, [
        'baseline_overrun',
        'model_unknown',
        'treatment_overrun',
    ]);
    assert.ok(receipt.payload.limitations.includes('reported_budget_overrun'));
});

test('every freeze/package/run receipt is checked before a new storage directory exists', (t) => {
    for (const variant of ['manifest', 'package', 'run', 'receipt', 'extra', 'link']) {
        const target = selected(t);
        importRun(target.benchmark, target, run(target, target.freeze));
        const files = {
            manifest: 'manifest.json',
            package: 'packages/example-skill/LICENSE',
            run: 'runs/treatment-one/run.json',
            receipt: 'runs/treatment-one/receipt.json',
        };
        if (files[variant]) fs.appendFileSync(path.join(target.output, files[variant]), 'tamper');
        if (variant === 'extra') write(target.output, 'unexpected.json', '{}');
        if (variant === 'link') {
            fs.unlinkSync(path.join(target.output, 'runs/treatment-one/artifacts/report.md'));
            fs.symlinkSync(
                target.artifactFile,
                path.join(target.output, 'runs/treatment-one/artifacts/report.md'),
            );
        }
        assert.throws(() =>
            target.service.record(target.database, {
                receipt: target.value,
                benchmark: target.output,
            }),
        );
        assert.equal(fs.existsSync(path.dirname(target.database)), false, variant);
    }
});

test('memory presents quality separately and counts its mirrored envelope only once', (t) => {
    const target = qualityFixture(t);
    const service = new SkillQualityService([]);
    const value = assertion();
    service.record(target.database, { receipt: value });
    const before = fs.readFileSync(target.database);
    const memory = new SkillMemoryService();
    const report = memory.summarize(target.database, query);
    assert.equal(report.quality_receipts.matching_receipts, 1);
    assert.equal(report.read_observations.reads, 0);
    assert.equal(report.receipt_schemas.official_validation, 'recorded_separate_quality_receipts');
    const retention = memory.retention(target.database, {
        ...query,
        cutoff: '2026-09-20T00:00:00.000Z',
    });
    const quality = retention.families.rows.find(
        (item) => item.family === 'skill.quality.recorded',
    );
    assert.equal(quality.total.count, 1);
    assert.deepEqual(fs.readFileSync(target.database), before);
});

test('manual/blocked joint workflow retains tuning phase and never attributes causality to one package', (t) => {
    const target = selected(t, (target) => {
        write(target.skills, 'peer-skill/SKILL.md', 'Synthetic peer instructions.\n');
        write(target.skills, 'peer-skill/LICENSE', 'Synthetic license.\n');
        target.suite.cases[0].skills.push('peer-skill');
        target.suite.cases[0].phase = 'tuning';
        write(target.source, 'suite.json', target.suite);
    });
    const baseline = run(target, target.freeze, 'baseline');
    baseline.execution.kind = 'manual';
    const treatment = run(target, target.freeze);
    treatment.execution.status = 'blocked';
    treatment.criteria = treatment.criteria.map((item) => ({
        ...item,
        verdict: 'blocked',
        evidence: [],
    }));
    importRun(target.benchmark, target, baseline);
    importRun(target.benchmark, target, treatment);
    target.service.record(target.database, { receipt: target.value, benchmark: target.output });
    const receipt = target.service.inspect(target.database, query).rows[0].receipt;
    assert.equal(receipt.payload.result, 'blocked');
    assert.equal(receipt.payload.coverage.treatment.blocked, 1);
    assert.equal(receipt.payload.coverage.manual_runs, 1);
    assert.equal(receipt.payload.coverage.unexecuted_runs, 1);
    assert.equal(receipt.payload.coverage.selected_cases[0].phase, 'tuning');
    assert.equal(receipt.payload.coverage.selected_cases[0].joint_workflow, true);
    for (const code of [
        'manual_evidence',
        'joint_workflow',
        'acceptance_is_phase_label',
        'comparison_incomplete',
    ])
        assert.ok(receipt.payload.limitations.includes(code), code);
});

test('a receipt scopes package cases but verification still rejects tampering in unrelated suite cases', (t) => {
    const target = selected(t, (target) => {
        write(target.skills, 'peer-skill/SKILL.md', 'Synthetic peer instructions.\n');
        write(target.skills, 'peer-skill/LICENSE', 'Synthetic license.\n');
        target.suite.cases.push({
            ...structuredClone(target.suite.cases[0]),
            id: 'peer-report',
            skills: ['peer-skill'],
            phase: 'exploratory',
        });
        write(target.source, 'suite.json', target.suite);
    });
    for (const variant of ['baseline', 'treatment'])
        importRun(target.benchmark, target, run(target, target.freeze, variant));
    const peer = run(target, target.freeze, 'treatment', {
        id: 'peer-failed',
        case_id: 'peer-report',
    });
    peer.criteria[0].verdict = 'fail';
    importRun(target.benchmark, target, peer);
    target.service.record(target.database, { receipt: target.value, benchmark: target.output });
    const receipt = target.service.inspect(target.database, query).rows[0].receipt;
    assert.equal(receipt.payload.result, 'pass');
    assert.equal(receipt.payload.coverage.expected_pairs, 1);
    assert.equal(receipt.payload.coverage.imported_runs, 2);
    assert.equal(receipt.payload.coverage.critical_failures, 0);
    assert.equal(receipt.payload.benchmark.suite_observed_treatment_result, 'fail');
    assert.equal(receipt.payload.benchmark.scope, 'selected_package_cases');
    fs.appendFileSync(
        path.join(target.output, 'runs', 'peer-failed', 'artifacts', 'report.md'),
        'tamper',
    );
    const next = behavioral();
    next.payload.source = target.value.payload.source;
    assert.throws(
        () =>
            target.service.record(path.join(target.root, 'untouched', 'evidence.db'), {
                receipt: next,
                benchmark: target.output,
            }),
        hasCode('invalid_input'),
    );
    assert.equal(fs.existsSync(path.join(target.root, 'untouched')), false);
});

test('noncritical grading failures stay counted when critical treatment criteria pass', (t) => {
    const target = selected(t);
    const treatment = run(target, target.freeze);
    treatment.criteria[1].verdict = 'fail';
    importRun(target.benchmark, target, treatment);
    target.service.record(target.database, { receipt: target.value, benchmark: target.output });
    const receipt = target.service.inspect(target.database, query).rows[0].receipt;
    assert.equal(receipt.payload.result, 'pass');
    assert.equal(receipt.payload.benchmark.result_basis, 'critical_treatment_criteria');
    assert.equal(receipt.payload.benchmark.treatment_failed_criteria, 1);
    assert.equal(receipt.payload.coverage.treatment_critical_failures, 0);
});

test('memory quality display truncates explicitly while retention counts all logical occurrences', (t) => {
    const target = qualityFixture(t);
    const service = new SkillQualityService([]);
    service.record(target.database, { receipt: assertion() });
    service.record(target.database, { receipt: assertion() });
    const memory = new SkillMemoryService();
    const report = memory.summarize(target.database, { ...query, limit: 1 });
    assert.equal(report.quality_receipts.rows.length, 1);
    assert.equal(report.quality_receipts.matching_receipts, 2);
    assert.equal(report.quality_receipts.truncated, true);
    assert.equal(report.truncated, true);
    const retention = memory.retention(target.database, query);
    assert.equal(
        retention.families.rows.find((item) => item.family === 'skill.quality.recorded').total
            .count,
        2,
    );
});
