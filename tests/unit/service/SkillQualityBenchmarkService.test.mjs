// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillBenchmarkService } from '../../../src/service/SkillBenchmarkService.ts';
import { SkillBenchmarkRepository } from '../../../src/repository/SkillBenchmarkRepository.ts';
import { fixture, run, importRun } from '../fixture/SkillBenchmarkFixture.mjs';
import { issuedBenchmarkBytes } from '../fixture/IssuedSkillBenchmarkBytes.mjs';

test('shared byte extraction keeps all existing freeze/load/run/compare normalized output bytes', (t) => {
    const target = fixture(t);
    const service = new SkillBenchmarkService();
    const repository = new SkillBenchmarkRepository();
    const { directory, ...freeze } = service.prepare(
        target.suiteFile,
        target.skills,
        target.output,
    );
    for (const variant of ['baseline', 'treatment'])
        importRun(service, target, run(target, freeze, variant));
    assert.equal(JSON.stringify(freeze), issuedBenchmarkBytes.prepare);
    assert.equal(JSON.stringify(repository.load(target.output)), issuedBenchmarkBytes.load);
    assert.equal(JSON.stringify(repository.runs(target.output)), issuedBenchmarkBytes.runs);
    assert.equal(JSON.stringify(service.compare(target.output)), issuedBenchmarkBytes.comparison);
    const evidence = service.inspectEvidence(target.output);
    assert.equal(JSON.stringify(evidence.comparison), issuedBenchmarkBytes.comparison);
    assert.equal(evidence.retained.length, 2);
    assert.match(evidence.frozen.manifest_sha256, /^[a-f0-9]{64}$/);
});
