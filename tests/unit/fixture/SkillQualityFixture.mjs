// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export const query = {
    collection: 'demo',
    from: '2026-09-01T00:00:00.000Z',
    until: '2026-10-01T00:00:00.000Z',
};
export function assertion(options = {}) {
    return {
        schema_version: 2,
        event_type: 'skill.quality.recorded',
        event_id: randomUUID(),
        correlation_id: randomUUID(),
        occurred_at: '2026-09-19T12:00:00.000Z',
        source_host: 'manual',
        source_adapter: 'test',
        session: null,
        payload: {
            collection: 'demo',
            skill: 'example-skill',
            source: {
                repository: 'https://example.org/skills',
                source_ref: null,
                resolved_git_sha: 'a'.repeat(40),
                package_path: 'skills/example-skill',
                package_sha256: 'b'.repeat(64),
            },
            kind: 'official_validation',
            method: { name: 'skills-ref', version: '0.1.0', revision: null, source_sha256: null },
            result: 'pass',
            coverage: {
                selected_packages: 1,
                executed: 1,
                blocked: 0,
                not_run: 0,
                passed: 1,
                failed: 0,
            },
            artifacts: [
                {
                    locator: 'observations/result.json',
                    sha256: 'c'.repeat(64),
                    scope: 'official_result',
                },
            ],
            limitations: [],
        },
        ...options,
    };
}
export function behavioral(options = {}) {
    const value = assertion();
    value.payload.kind = 'behavioral_evaluation';
    value.payload.method.name = 'retained-benchmark-comparison';
    value.payload.artifacts[0].scope = 'benchmark_manifest';
    value.payload.coverage = {
        expected_pairs: 1,
        imported_runs: 2,
        missing_runs: 0,
        paired_cases: 1,
        declared_agent_pairs: 1,
        declared_controlled_agent_pairs: 1,
        fixture_runs: 0,
        manual_runs: 0,
        unexecuted_runs: 0,
        critical_failures: 0,
        treatment_critical_failures: 0,
        comparison_status: 'complete',
        selected_cases: [
            {
                case_id: 'example-case',
                phase: 'final-acceptance',
                attempts: 1,
                joint_workflow: false,
            },
        ],
        treatment: {
            expected: 1,
            executed: 1,
            blocked: 0,
            not_run: 0,
            missing: 0,
            passed: 1,
            failed: 0,
            unresolved: 0,
        },
    };
    return { ...value, ...options };
}
export function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'i9-quality-private-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return { root, database: path.join(root, 'evidence.db') };
}
export const reversed = (value) =>
    Array.isArray(value)
        ? value.map(reversed)
        : value && typeof value === 'object'
          ? Object.fromEntries(
                Object.entries(value)
                    .reverse()
                    .map(([key, child]) => [key, reversed(child)]),
            )
          : value;
