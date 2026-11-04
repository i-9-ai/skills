import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('./fixtures/semantic-compaction/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const corpus = JSON.parse(read('cases.json'));
const baseline = JSON.parse(read('baseline/policy.json'));
const candidate = JSON.parse(read('candidate/policy.json'));
const cases = Object.values(corpus.splits).flat();

// This bounded interpreter exercises synthetic policy data, not arbitrary skills.
// Fixture examples and expected outcomes were frozen before the first execution.
function run(policy, overrides = {}) {
    const input = {
        conflict: false,
        evidence: 'confirmed',
        dependency: true,
        schema: true,
        row: true,
        approved: null,
        ...overrides,
    };
    for (const gate of policy.order) {
        if (gate === 'conflict' && input.conflict) return 'blocked-conflict';
        if (gate === 'evidence' && input.evidence !== policy.evidence) return 'blocked-evidence';
        if (gate === 'dependency' && !input.dependency) return 'blocked-dependency';
        if (gate === 'schema' && !input.schema) return 'reject-schema';
        if (gate === 'row' && !input.row) return 'reject-row';
        if (gate === 'approval') {
            return input.approved === policy.output ||
                (policy.approval === 'any-output' && input.approved)
                ? 'write'
                : 'preview';
        }
    }
    return 'unresolved';
}

for (const [split, tasks] of Object.entries(corpus.splits)) {
    test(`synthetic compaction preserves ${split} decisions`, () => {
        for (const task of tasks) {
            assert.equal(run(baseline, task.input), task.expected, `baseline ${task.id}`);
            assert.equal(run(candidate, task.input), task.expected, `candidate ${task.id}`);
        }
    });
}

test('counts the complete loaded route, including its mandatory dependency', () => {
    const cost = (name) =>
        ['SKILL.md', 'policy.json'].reduce(
            (total, path) => total + Buffer.byteLength(read(`${name}/${path}`)),
            0,
        );
    assert.ok(cost('candidate') <= cost('baseline') * (1 - corpus.threshold));
    assert.ok(cost('candidate') > Buffer.byteLength(read('candidate/SKILL.md')));
});

test('negative controls reject exception loss, precedence reversal and missing gates', () => {
    const mutations = [
        { ...candidate, approval: 'any-output' },
        { ...candidate, order: ['row', 'schema', 'approval'] },
        ...['conflict', 'evidence', 'dependency', 'schema', 'row'].map((gate) => ({
            ...candidate,
            order: candidate.order.filter((value) => value !== gate),
        })),
    ];
    for (const mutation of mutations) {
        assert.ok(cases.some((task) => run(mutation, task.input) !== task.expected));
    }
});

test('coverage checks reject omitted examples and incompatible input/output contracts', () => {
    const required = (policy) =>
        policy.encoding === 'UTF-8' &&
        policy.required === 'id' &&
        policy.unique === true &&
        policy.dependency === 'bundled-parser' &&
        policy.example?.input === 'id\n7\n7' &&
        JSON.stringify(policy.example?.output) === '["7"]';
    assert.ok(required(baseline));
    assert.ok(required(candidate));
    for (const key of ['encoding', 'required', 'unique', 'dependency', 'example']) {
        const mutation = { ...candidate };
        delete mutation[key];
        assert.equal(required(mutation), false);
    }
});
