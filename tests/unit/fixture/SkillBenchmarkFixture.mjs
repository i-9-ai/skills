// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function write(directory, relative, value) {
    const selected = path.join(directory, relative);
    fs.mkdirSync(path.dirname(selected), { recursive: true });
    fs.writeFileSync(
        selected,
        typeof value === 'string' || Buffer.isBuffer(value)
            ? value
            : `${JSON.stringify(value, null, 2)}\n`,
    );
    return selected;
}

export function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'i9-benchmark-test-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const skills = path.join(root, 'skills');
    const artifacts = path.join(root, 'artifacts');
    const output = path.join(root, 'frozen');
    fs.mkdirSync(artifacts);
    write(
        source,
        'prompt.md',
        'Create a bounded skill change report using the supplied synthetic facts.\n',
    );
    write(source, 'facts.json', { change: 'rename a synthetic skill', authority: 'draft only' });
    write(
        skills,
        'example-skill/SKILL.md',
        '---\nname: example-skill\ndescription: Produce a synthetic skill report.\n---\n\n# Example\n',
    );
    write(skills, 'example-skill/LICENSE', 'Synthetic original fixture; no readiness assertion.\n');
    write(
        skills,
        'example-skill/scripts/inert.mjs',
        'throw new Error("This fixture script must never execute.");\n',
    );
    const suite = {
        schema_version: 1,
        id: 'synthetic-suite',
        description: 'Synthetic test data, not an actual agent evaluation.',
        cases: [
            {
                id: 'make-report',
                phase: 'final-acceptance',
                class: 'functional',
                prompt: 'prompt.md',
                fixtures: [{ path: 'facts.json', target: 'inputs/facts.json' }],
                skills: ['example-skill'],
                criteria: [
                    {
                        id: 'authority',
                        critical: true,
                        description: 'Retain the draft-only authority; evaluator-only oracle.',
                    },
                    {
                        id: 'clarity',
                        critical: false,
                        description: 'Describe the supplied change.',
                    },
                ],
                limits: { attempts: 1, seconds: 120 },
            },
        ],
    };
    const suiteFile = write(source, 'suite.json', suite);
    const artifactFile = write(
        artifacts,
        'report.md',
        'Synthetic retained report and grading evidence.\n',
    );
    return { root, source, skills, artifacts, output, suite, suiteFile, artifactFile };
}

export function run(target, freeze, variant = 'treatment', overrides = {}) {
    const bytes = fs.readFileSync(target.artifactFile);
    return {
        schema_version: 1,
        id: `${variant}-one`,
        benchmark_sha256: freeze.benchmark_sha256,
        case_id: 'make-report',
        variant,
        attempt: 1,
        execution: {
            kind: 'fixture',
            status: 'executed',
            executor: 'synthetic-test-only',
            model: 'synthetic-model',
            environment: 'synthetic-runtime',
            settings: 'synthetic-fixed-budget',
            fresh_context: true,
        },
        metrics: { wall_time_ms: null, input_tokens: null, output_tokens: null },
        artifacts: [{ path: 'report.md', sha256: digest(bytes), bytes: bytes.length }],
        criteria: target.suite.cases[0].criteria.map((criterion) => ({
            id: criterion.id,
            verdict: 'pass',
            reason: 'Synthetic assertion used to test data integrity; no real model ran.',
            evidence: ['report.md'],
        })),
        limitations: ['This is synthetic test data, never behavioral proof.'],
        ...overrides,
    };
}

export function importRun(service, target, value) {
    const selected = write(target.root, `${value.id}.json`, value);
    return service.importRun(target.output, selected, target.artifacts);
}
