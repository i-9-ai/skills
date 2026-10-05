// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SkillQualityService } from '../../../src/service/SkillQualityService.ts';
import { OfficialQualityValidator } from '../../../src/validator/OfficialQualityValidator.ts';
import { SkillPackageRevisionRepository } from '../../../src/repository/SkillPackageRevisionRepository.ts';
import { fixture } from '../fixture/SkillQualityFixture.mjs';

const method = {
    name: 'skills-ref',
    version: '0.1.0',
    revision: 'a'.repeat(40),
    source_sha256: 'b'.repeat(64),
};
function observationFixture(t) {
    const { root, database } = fixture(t);
    const caller = path.join(root, 'caller');
    const selected = path.join(caller, '.agents', 'skills', 'example-skill');
    fs.mkdirSync(selected, { recursive: true });
    fs.writeFileSync(path.join(selected, 'SKILL.md'), 'Synthetic skill only.\n');
    fs.writeFileSync(path.join(selected, 'LICENSE'), 'Synthetic license only.\n');
    const request = {
        collection: 'demo',
        skill: 'example-skill',
        source: {
            repository: 'https://example.org/skills',
            source_ref: null,
            resolved_git_sha: null,
            package_path: '.agents/skills/example-skill',
            package_sha256: new SkillPackageRevisionRepository().inspect(selected).package_sha256,
        },
    };
    return {
        root,
        database,
        caller,
        selected,
        request,
        output: path.join(root, 'new-observation'),
    };
}
function executor(f, options = {}) {
    return {
        validateOfficial(root, callbacks) {
            assert.equal(root, f.caller);
            const selected = { name: f.request.skill, path: f.selected };
            callbacks.beforeSetup({ version: method.version, method, phases: [] }, [selected]);
            if (options.beforeSetupComplete) options.beforeSetupComplete();
            callbacks.onSetup('started');
            if (options.setupFailure) {
                callbacks.onSetup('setup_failed');
                throw new Error('Synthetic private setup detail');
            }
            callbacks.onSetup('completed');
            const state = options.versionState ?? 'verified';
            callbacks.onVersion({
                state,
                observed_version:
                    state === 'verified'
                        ? method.version
                        : state === 'version_mismatch'
                          ? '9.9'
                          : null,
                process: { status: 'completed', exit_code: 0, signal: null },
            });
            if (state !== 'verified') throw new Error('Synthetic private version detail');
            callbacks.beforeValidate(selected);
            if (options.onValidate) options.onValidate();
            if (options.mutate) options.mutate();
            const process = options.process ?? { status: 'completed', exit_code: 0, signal: null };
            callbacks.afterValidate(selected, process);
            return [
                {
                    name: selected.name,
                    passed: process.status === 'completed' && process.exit_code === 0,
                    diagnostic: '',
                },
                {
                    name: 'generated-scaffold',
                    passed: options.scaffoldPass ?? true,
                    diagnostic: '',
                },
            ];
        },
    };
}

test('official observation requires explicit executor composition before filesystem effects', (t) => {
    const f = observationFixture(t);
    const service = new SkillQualityService([f.caller]);
    assert.throws(
        () => service.observeOfficial(f.caller, f.request, f.database, f.output),
        (error) => error.code === 'invalid_input',
    );
    assert.equal(fs.existsSync(f.database), false);
    assert.equal(fs.existsSync(f.output), false);
});

test('actual observer seam records only unchanged selected official pass and excludes scaffold', (t) => {
    const f = observationFixture(t);
    const service = new SkillQualityService([f.caller], executor(f));
    const result = service.observeOfficial(f.caller, f.request, f.database, f.output);
    assert.equal(result.observation.artifact.result, 'pass');
    assert.equal(result.observation.quality.recorded, true);
    assert.equal(result.results.length, 2);
    const date = result.observation.artifact.occurred_at.slice(0, 10);
    const report = service.inspect(f.database, {
        collection: 'demo',
        from: date + 'T00:00:00.000Z',
        until: new Date(Date.parse(date + 'T00:00:00.000Z') + 86400000).toISOString(),
    });
    assert.equal(report.rows.length, 1);
    const receipt = report.rows[0].receipt;
    assert.equal(receipt.payload.skill, 'example-skill');
    assert.equal(receipt.payload.assurance, 'locally_observed_official_process');
    assert.deepEqual(receipt.payload.coverage, {
        selected_packages: 1,
        executed: 1,
        blocked: 0,
        not_run: 0,
        passed: 1,
        failed: 0,
    });
    assert.equal(receipt.payload.source.package_sha256, f.request.source.package_sha256);
    assert.deepEqual(receipt.payload.method, method);
    assert.equal(fs.readdirSync(f.output).length, 1);
    const retained = fs.readFileSync(
        path.join(f.output, result.observation.retained.locator),
        'utf8',
    );
    assert.equal(retained, JSON.stringify(result.observation.artifact) + '\n');
    assert.doesNotMatch(
        retained,
        /Synthetic private|\/Users\/|\/private\/|diagnostic|stdout|stderr/,
    );
});

for (const process of [
    { status: 'completed', exit_code: 1, signal: null },
    { status: 'timeout', exit_code: null, signal: 'SIGTERM' },
    { status: 'unavailable', exit_code: null, signal: null },
    { status: 'interrupted', exit_code: null, signal: 'SIGINT' },
    { status: 'execution_error', exit_code: null, signal: null },
    { status: 'execution_error', exit_code: 0, signal: null },
])
    test(
        'preserves unchanged selected negative observation: ' +
            process.status +
            '/' +
            process.exit_code,
        (t) => {
            const f = observationFixture(t);
            const result = new SkillQualityService(
                [f.caller],
                executor(f, { process }),
            ).observeOfficial(f.caller, f.request, f.database, f.output);
            assert.equal(
                result.observation.artifact.result,
                process.status === 'completed' ? 'fail' : 'blocked',
            );
            assert.equal(result.observation.quality.recorded, true);
            assert.ok(fs.existsSync(f.database));
        },
    );

for (const options of [
    { setupFailure: true },
    { versionState: 'version_mismatch' },
    { versionState: 'version_unavailable' },
])
    test(
        'setup/version failure retains artifact without observed receipt: ' +
            JSON.stringify(options),
        (t) => {
            const f = observationFixture(t);
            const result = new SkillQualityService(
                [f.caller],
                executor(f, options),
            ).observeOfficial(f.caller, f.request, f.database, f.output);
            assert.equal(result.official_failed, true);
            assert.equal(result.observation.artifact.result, 'blocked');
            assert.equal(result.observation.quality, null);
            assert.equal(fs.existsSync(f.database), false);
            assert.ok(fs.existsSync(path.join(f.output, 'official-quality.json')));
        },
    );

for (const change of ['content', 'missing'])
    test('changed/unknown post-validation candidate gets no receipt: ' + change, (t) => {
        const f = observationFixture(t);
        const mutate = () =>
            change === 'missing'
                ? fs.unlinkSync(path.join(f.selected, 'LICENSE'))
                : fs.appendFileSync(path.join(f.selected, 'SKILL.md'), 'Changed\n');
        const result = new SkillQualityService([f.caller], executor(f, { mutate })).observeOfficial(
            f.caller,
            f.request,
            f.database,
            f.output,
        );
        assert.equal(result.observation.artifact.result, 'blocked');
        assert.equal(
            result.observation.artifact.reason,
            change === 'missing' ? 'package_after_unavailable' : 'package_changed',
        );
        assert.equal(result.observation.quality, null);
        assert.equal(fs.existsSync(f.database), false);
    });

test('stale digest, malformed request and unsafe selections reject before official effects', (t) => {
    const f = observationFixture(t);
    let effects = 0;
    const service = new SkillQualityService([f.caller], {
        validateOfficial() {
            effects++;
            throw new Error('Must not run');
        },
    });
    for (const [request, database, output] of [
        [
            { ...f.request, source: { ...f.request.source, package_sha256: 'f'.repeat(64) } },
            f.database,
            f.output,
        ],
        [{ ...f.request, assurance: 'locally_observed_official_process' }, f.database, f.output],
        [f.request, path.join(f.caller, 'evidence.db'), f.output],
        [f.request, f.database, path.join(f.caller, 'new')],
    ])
        assert.throws(() => service.observeOfficial(f.caller, request, database, output));
    assert.equal(effects, 0);
    assert.equal(fs.existsSync(f.database), false);
    assert.equal(fs.existsSync(f.output), false);
});

test('late database failure preserves compact observation artifact', (t) => {
    const f = observationFixture(t);
    fs.writeFileSync(f.database, 'Not SQLite, do not overwrite.\n');
    const original = fs.readFileSync(f.database);
    assert.throws(
        () =>
            new SkillQualityService([f.caller], executor(f)).observeOfficial(
                f.caller,
                f.request,
                f.database,
                f.output,
            ),
        (error) => error.code === 'storage_unavailable',
    );
    assert.ok(fs.existsSync(path.join(f.output, 'official-quality.json')));
    assert.deepEqual(fs.readFileSync(f.database), original);
});

test('failed generated scaffold does not invalidate unchanged selected package receipt', (t) => {
    const f = observationFixture(t);
    const result = new SkillQualityService(
        [f.caller],
        executor(f, { scaffoldPass: false }),
    ).observeOfficial(f.caller, f.request, f.database, f.output);
    assert.equal(result.results.at(-1).passed, false);
    assert.equal(result.observation.artifact.result, 'pass');
    assert.equal(result.observation.quality.recorded, true);
});

test('internal observation derives its verdict and rejects supplied verdict or assurance fields', (t) => {
    const f = observationFixture(t);
    const fingerprint = new SkillPackageRevisionRepository().inspect(f.selected);
    const validator = new OfficialQualityValidator();
    const value = {
        schema_version: 1,
        event_id: '11111111-1111-4111-8111-111111111111',
        correlation_id: '22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-10-04T00:00:00.000Z',
        ...f.request,
        method,
        setup: 'completed',
        version_check: { status: 'matched', observed_version: method.version },
        process: { status: 'execution_error', exit_code: 0, signal: null },
        before: fingerprint,
        after: fingerprint,
    };
    const normalized = validator.observation(value, f.request);
    assert.equal(normalized.result, 'blocked');
    assert.equal(normalized.reason, 'process_execution_error');
    for (const fields of [
        { result: 'pass' },
        { reason: 'conformance_pass' },
        { assurance: 'locally_observed_official_process' },
        { unexpected: true },
    ])
        assert.throws(
            () => validator.observation({ ...value, ...fields }, f.request),
            (error) => error.code === 'invalid_input',
        );
    assert.equal(fs.existsSync(f.database), false);
    assert.equal(fs.existsSync(f.output), false);
});

test('file wrapper protects an external request while sibling DB and artifact destinations remain valid', async (t) => {
    const f = observationFixture(t);
    const input = path.join(f.root, 'request.json');
    const bytes = JSON.stringify(f.request) + '\n';
    fs.writeFileSync(input, bytes);
    const result = await new SkillQualityService([f.caller], executor(f)).observeOfficialFile(
        f.caller,
        input,
        f.database,
        f.output,
    );
    assert.equal(result.observation.artifact.result, 'pass');
    assert.equal(result.observation.quality.recorded, true);
    assert.equal(fs.readFileSync(input, 'utf8'), bytes);
    assert.equal(JSON.stringify(result.observation.artifact).includes(input), false);
});

test('file wrapper rejects request/DB/sidecar/output collisions before official effects', async (t) => {
    for (const suffix of ['', '-journal', '-wal', '-shm', 'output']) {
        const f = observationFixture(t);
        const input = suffix === 'output' ? path.join(f.root, 'request.json') : f.database + suffix;
        const output = suffix === 'output' ? input : f.output;
        const bytes = JSON.stringify(f.request) + '\n';
        fs.writeFileSync(input, bytes);
        let calls = 0;
        const official = {
            validateOfficial() {
                calls++;
                throw new Error('Must not run');
            },
        };
        await assert.rejects(
            new SkillQualityService([f.caller], official).observeOfficialFile(
                f.caller,
                input,
                f.database,
                output,
            ),
            (error) => error.code === 'invalid_input',
        );
        assert.equal(calls, 0);
        assert.equal(fs.readFileSync(input, 'utf8'), bytes);
        if (suffix !== '') assert.equal(fs.existsSync(f.database), false);
        if (suffix !== 'output') assert.equal(fs.existsSync(f.output), false);
    }
});

test('changed request-file identity after preflight prevents artifact and DB effects', async (t) => {
    const f = observationFixture(t);
    const input = path.join(f.root, 'request.json');
    const bytes = JSON.stringify(f.request) + '\n';
    fs.writeFileSync(input, bytes);
    const official = executor(f, {
        beforeSetupComplete() {
            fs.renameSync(input, input + '.saved');
            fs.writeFileSync(input, bytes);
        },
    });
    await assert.rejects(
        new SkillQualityService([f.caller], official).observeOfficialFile(
            f.caller,
            input,
            f.database,
            f.output,
        ),
        (error) => error.code === 'invalid_input',
    );
    assert.equal(fs.existsSync(f.database), false);
    assert.equal(fs.existsSync(f.output), false);
    assert.equal(
        new SkillPackageRevisionRepository().inspect(f.selected).package_sha256,
        f.request.source.package_sha256,
    );
});

test('candidate changed during setup cannot run selected validation or obtain a receipt', (t) => {
    const f = observationFixture(t);
    let selectedCalls = 0;
    const official = executor(f, {
        beforeSetupComplete() {
            fs.appendFileSync(path.join(f.selected, 'SKILL.md'), 'Changed before validation\n');
        },
        onValidate() {
            selectedCalls++;
        },
    });
    const result = new SkillQualityService([f.caller], official).observeOfficial(
        f.caller,
        f.request,
        f.database,
        f.output,
    );
    assert.equal(selectedCalls, 0);
    assert.equal(result.official_failed, true);
    assert.equal(result.observation.artifact.result, 'blocked');
    assert.equal(result.observation.artifact.reason, 'package_changed');
    assert.equal(result.observation.artifact.process.status, 'unavailable');
    assert.equal(result.observation.quality, null);
    assert.equal(fs.existsSync(f.database), false);
});

test('stdin wrapper supplies no input-file selection and keeps request JSON closed', async (t) => {
    const f = observationFixture(t);
    const { TelemetryInputRepository } =
        await import('../../../src/repository/TelemetryInputRepository.ts');
    t.mock.method(TelemetryInputRepository.prototype, 'read', async (file, _input, limit) => {
        assert.equal(file, '-');
        assert.equal(limit, 16_384);
        return structuredClone(f.request);
    });
    const result = await new SkillQualityService([f.caller], executor(f)).observeOfficialFile(
        f.caller,
        '-',
        f.database,
        f.output,
    );
    assert.equal(result.observation.artifact.result, 'pass');
    assert.equal(result.observation.quality.recorded, true);
    const extra = { ...f.request, input_files: [path.join(f.root, 'caller-selected')] };
    assert.throws(
        () =>
            new SkillQualityService([f.caller], executor(f)).observeOfficial(
                f.caller,
                extra,
                f.database,
                f.output,
            ),
        (error) => error.code === 'invalid_input',
    );
});
