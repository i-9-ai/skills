// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SkillBenchmarkRepository } from '../../../src/repository/SkillBenchmarkRepository.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const suiteFile = join(root, 'benchmarks/behavioral/resilience-suite.json');

test('the workflow resilience corpus freezes all six cases and reproduces the recoverable read', (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'skill-workflow-resilience-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const freeze = join(directory, 'freeze');
    const repository = new SkillBenchmarkRepository();
    repository.prepare(suiteFile, join(root, '.agents/skills'), freeze);
    const { suite } = repository.load(freeze);
    const workflows = [
        ['authoring', 'skill-authoring', 'process-policy.md'],
        ['refactoring', 'skills-refactoring', 'consumers.json'],
    ];
    const conditions = ['recoverable', 'approved', 'blocked'];
    assert.deepEqual(
        suite.cases.map((entry) => entry.id).sort(),
        workflows.flatMap(([workflow]) => conditions.map((condition) => `${workflow}-${condition}`)).sort(),
    );

    for (const [workflow, skill, filename] of workflows) {
        for (const condition of conditions) {
            const id = `${workflow}-${condition}`;
            const frozenCase = join(freeze, 'cases', id);
            const workspace = join(directory, id);
            cpSync(join(frozenCase, 'fixtures'), workspace, { recursive: true });
            const executor = JSON.parse(readFileSync(join(frozenCase, 'executor.json'), 'utf8'));
            assert.deepEqual(executor.baseline_packages, []);
            assert.ok(executor.treatment_packages.includes(`packages/${skill}`));
            assert.equal(Object.hasOwn(executor, 'criteria'), false);
            assert.deepEqual(
                readFileSync(join(workspace, 'inputs/access.md')),
                readFileSync(join(root, `benchmarks/behavioral/resilience/access-${condition}.md`)),
            );
            const evidencePath = join(workspace, 'inputs', filename);
            const evidence = readFileSync(evidencePath);
            assert.ok(evidence.length > 0);
            const reader = join(workspace, 'inputs/read-evidence.mjs');
            assert.equal(existsSync(reader), condition === 'recoverable');

            if (condition === 'recoverable') {
                const invoke = (argument) => spawnSync(process.execPath, [reader, argument], {
                    cwd: workspace,
                    timeout: 5_000,
                });
                const invalid = invoke('../LICENSE');
                assert.equal(invalid.status, 64, invalid.stderr.toString());
                assert.equal(existsSync(join(workspace, '.read-evidence-attempted')), false);

                const first = invoke(filename);
                assert.equal(first.status, 75, first.stderr.toString());
                assert.equal(first.stdout.length, 0);
                assert.match(first.stderr.toString(), /EVIDENCE_TEMPORARILY_UNAVAILABLE/);
                const second = invoke(filename);
                assert.equal(second.status, 0, second.stderr.toString());
                assert.deepEqual(second.stdout, evidence);
                assert.deepEqual(readFileSync(evidencePath), evidence);
            }
        }
    }
    // The attempt copies are disposable and the frozen input tree still verifies.
    assert.equal(repository.load(freeze).suite.id, 'skill-workflow-resilience-v1');
});
