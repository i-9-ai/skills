// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SafeRoot } from '../../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import {
    checkCatalog,
    parseSkillSummary,
    strictJson,
    syncCatalog,
} from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import {
    queryAggregateIndex,
    readAggregateIndex,
    readSourceCatalog,
    rebuildAggregateIndex,
} from '../../../.agents/skills/skills-catalog-index/scripts/aggregate_index.mjs';

const scenario = JSON.parse(
    fs.readFileSync(new URL('./federated-consumer.fixture.json', import.meta.url), 'utf8'),
);
const license = fs.readFileSync(new URL('../../../LICENSE', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function write(root, relative, bytes) {
    const filename = join(root, relative);
    fs.mkdirSync(join(filename, '..'), { recursive: true });
    fs.writeFileSync(filename, bytes, { flag: 'wx' });
    return filename;
}

function snapshot(directory) {
    const root = new SafeRoot(directory);
    try {
        return root
            .inventory()
            .map(([relative, info]) => [
                relative,
                info.isDirectory() ? null : sha256(root.readBytes(relative)),
            ])
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    } finally {
        root.close();
    }
}

function entrypoint(collection, skill) {
    return [
        '---',
        `name: ${skill.name}`,
        `description: ${JSON.stringify(skill.description)}`,
        'license: Apache-2.0',
        'metadata:',
        `  author: ${JSON.stringify(collection.owner)}`,
        `  source_url: ${JSON.stringify(collection.source_uri)}`,
        `  tags: ${JSON.stringify(skill.tags.join(', '))}`,
        '---',
        '',
        `# ${skill.name}`,
        '',
        'Synthetic fixture instructions; no model execution or package readiness is asserted.',
        '',
        ...skill.instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
        '',
        'The [artifact contract](references/contract.json) declares the exact input, output and allowed local effects for this fixture.',
        '',
    ].join('\n');
}

async function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'i9-federated-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const sources = new Map();
    const pins = new Map();
    for (const collection of scenario.collections) {
        const directory = join(root, 'sources', collection.id);
        for (const skill of collection.packages) {
            const path = `.agents/skills/${skill.name}`;
            write(directory, `${path}/SKILL.md`, entrypoint(collection, skill));
            write(directory, `${path}/LICENSE`, license);
            write(directory, `${path}/references/contract.json`, jsonBytes(skill.contract));
            pins.set(`${collection.id}:${skill.name}`, {
                source_id: collection.id,
                owner: collection.owner,
                source_uri: `${collection.source_uri}/${skill.name}`,
                name: skill.name,
                path,
                content_sha256: sha256(jsonBytes(snapshot(join(directory, path)))),
                license_sha256: sha256(license),
                git_revision: null,
            });
        }
        syncCatalog(directory);
        assert.equal(checkCatalog(directory).changed, false);
        sources.set(collection.id, directory);
    }
    const before = snapshot(join(root, 'sources'));
    const caller = join(root, 'caller');
    const output = join(caller, 'index');
    const sourceArguments = [...sources].map(
        ([id, directory]) => `${id}=${join(directory, 'skills-catalog.json')}`,
    );
    const built = await rebuildAggregateIndex({ sources: sourceArguments, output, format: 'json' });
    const index = await readAggregateIndex(built.index);
    const evidence = join(caller, 'evidence');
    fs.mkdirSync(evidence);
    return {
        root,
        sources,
        pins,
        before,
        caller,
        evidence,
        index,
        indexFile: built.index,
        output,
        sourceArguments,
    };
}

// This fixture verifier checks an authored route and fixed contracts. It is not
// an implementation of semantic skill selection or a general execution engine.
async function qualifyRoute(target, route) {
    try {
        assert.equal(route.result, 'sequence', 'the pilot requires its authored sequence');
        assert.equal(
            route.steps.length,
            scenario.request.max_stages,
            'the authored two-stage budget must be preserved',
        );
        const identities = [];
        const contracts = [];
        for (const step of route.steps) {
            assert.ok(step.source_id, 'ambiguous package identity: select an explicit source');
            const matches = await queryAggregateIndex(target.indexFile, {
                sourceId: step.source_id,
                name: step.name,
                limit: scenario.request.max_candidates,
            });
            assert.equal(
                matches.length,
                1,
                'required capability unavailable in the selected sources',
            );
            const record = matches[0];
            const directory = target.sources.get(step.source_id);
            assert.ok(directory, 'source is outside the caller selection');
            const observedSource = target.index.sources.find(
                (source) => source.id === step.source_id,
            );
            const currentSource = readSourceCatalog({
                id: step.source_id,
                filename: join(directory, 'skills-catalog.json'),
            });
            assert.equal(
                currentSource.catalog_sha256,
                observedSource.catalog_sha256,
                'catalog changed after discovery',
            );
            checkCatalog(directory);
            const pin = target.pins.get(`${step.source_id}:${step.name}`);
            assert.ok(pin, 'package has no caller-reviewed identity pin');
            assert.equal(record.path, pin.path, 'package path differs from the selected identity');
            const packageDirectory = join(directory, record.path);
            assert.equal(
                sha256(jsonBytes(snapshot(packageDirectory))),
                pin.content_sha256,
                'package content changed after qualification input was frozen',
            );
            const packageRoot = new SafeRoot(packageDirectory);
            try {
                const instructions = packageRoot.readBytes('SKILL.md');
                const { source_id, path, ...summary } = record;
                assert.deepEqual(
                    parseSkillSummary(instructions, step.name),
                    summary,
                    'actual entrypoint metadata differs from the index',
                );
                assert.equal(
                    sha256(packageRoot.readBytes('LICENSE')),
                    pin.license_sha256,
                    'license bytes differ from the reviewed fixture',
                );
                const contract = strictJson(packageRoot.readBytes('references/contract.json'));
                assert.equal(
                    contract.capability,
                    step.capability,
                    'selected package owns a different capability',
                );
                for (const effect of step.effects ?? contract.effects) {
                    assert.ok(
                        scenario.request.allowed_effects.includes(effect) &&
                            contract.effects.includes(effect),
                        'handoff would expand caller or specialist authority',
                    );
                }
                const previous = contracts.at(-1);
                if (previous)
                    assert.equal(
                        previous.output,
                        contract.input,
                        'specialist artifact interfaces do not match',
                    );
                contracts.push(contract);
                identities.push({
                    ...pin,
                    catalog_sha256: observedSource.catalog_sha256,
                    entrypoint_sha256: sha256(instructions),
                });
            } finally {
                packageRoot.close();
            }
        }
        return {
            status: 'qualified-fixture',
            identities,
            contracts,
            setup_readiness: route.setup_readiness,
        };
    } catch (error) {
        return { status: 'blocked', reason: error.message };
    }
}

function producePlan(target, plan = scenario.plan) {
    const path = 'producer/plan.json';
    const bytes = jsonBytes(plan);
    write(target.evidence, path, bytes);
    return { path, sha256: sha256(bytes) };
}

function inspectHandoff(target, route, artifact) {
    if (route.status !== 'qualified-fixture') return route;
    const root = new SafeRoot(target.evidence);
    try {
        const bytes = root.readBytes(artifact.path, scenario.request.max_artifact_bytes);
        assert.equal(
            sha256(bytes),
            artifact.sha256,
            'handoff artifact changed after the producer returned it',
        );
        const plan = strictJson(bytes);
        assert.equal(
            plan.format,
            route.contracts[0].output,
            'producer artifact version is unsupported',
        );
        assert.equal(
            plan.format,
            route.contracts[1].input,
            'consumer artifact version is unsupported',
        );
        assert.equal(typeof plan.primary_output, 'string', 'plan primary output is missing');
        assert.ok(Array.isArray(plan.exclusions), 'plan exclusions are missing');
        const review = {
            format: route.contracts[1].output,
            evidence_kind: scenario.evidence_kind,
            producer: `${route.identities[0].source_id}:${route.identities[0].name}`,
            consumer: `${route.identities[1].source_id}:${route.identities[1].name}`,
            package_identities: route.identities,
            input: artifact,
            checked: [
                'exact input digest',
                'compatible artifact version',
                'primary output and exclusions present',
            ],
            semantic_quality: 'not evaluated',
            setup_readiness: route.setup_readiness,
        };
        const path = 'reviewer/review.json';
        const reviewBytes = jsonBytes(review);
        write(target.evidence, path, reviewBytes);
        return {
            status: 'fixture-completed',
            artifact: { path, sha256: sha256(reviewBytes) },
            review,
        };
    } catch (error) {
        return { status: 'blocked', reason: error.message };
    } finally {
        root.close();
    }
}

test('federated consumer preserves source-qualified collisions and completes one bounded artifact handoff', async (t) => {
    const target = await fixture(t);
    assert.deepEqual(
        target.index.sources.map((source) => source.id),
        ['cedar', 'meadow'],
    );
    assert.equal(new Set([...target.pins.values()].map((pin) => pin.owner)).size, 2);
    const candidates = await queryAggregateIndex(target.indexFile, {
        name: 'skill-review',
        limit: scenario.request.max_candidates,
    });
    assert.deepEqual(
        candidates.map((candidate) => `${candidate.source_id}:${candidate.name}`),
        ['cedar:skill-review', 'meadow:skill-review'],
    );
    assert.equal(target.index.skills.length, scenario.request.max_candidates);

    const route = await qualifyRoute(target, scenario.route);
    assert.equal(route.status, 'qualified-fixture', route.reason);
    assert.deepEqual(
        route.identities.map((identity) => `${identity.source_id}:${identity.name}`),
        ['cedar:skill-plan', 'meadow:skill-review'],
    );
    assert.ok(route.identities.every((identity) => identity.git_revision === null));
    assert.equal(route.setup_readiness, 'setup status unknown');
    assert.equal(
        (
            await queryAggregateIndex(target.indexFile, {
                name: route.contracts[0].optional_companion,
            })
        ).length,
        0,
    );
    assert.equal(scenario.plan.presentation, route.contracts[0].fallback);

    const plan = producePlan(target);
    const result = inspectHandoff(target, route, plan);
    assert.equal(result.status, 'fixture-completed', result.reason);
    assert.equal(result.review.input.sha256, plan.sha256);
    assert.equal(result.review.semantic_quality, 'not evaluated');
    assert.deepEqual(result.review.package_identities, route.identities);
    assert.ok(
        fs.statSync(join(target.evidence, result.artifact.path)).size <=
            scenario.request.max_artifact_bytes,
    );
    assert.equal(
        sha256(fs.readFileSync(join(target.evidence, result.artifact.path))),
        result.artifact.sha256,
    );
    assert.deepEqual(snapshot(join(target.root, 'sources')), target.before);
    assert.deepEqual(fs.readdirSync(target.caller).sort(), ['evidence', 'index']);
    assert.equal(fs.existsSync(join(target.caller, '.agents')), false);

    const indexBytes = fs.readFileSync(target.indexFile);
    await rebuildAggregateIndex({
        sources: [...target.sourceArguments].reverse(),
        output: target.output,
        format: 'json',
    });
    assert.deepEqual(fs.readFileSync(target.indexFile), indexBytes);
    assert.equal(
        indexBytes.includes(target.root),
        false,
        'the aggregate retains logical provenance without host paths',
    );
});

test('missing capability returns scoped none and a missing selected companion blocks while retaining the plan', async (t) => {
    const target = await fixture(t);
    const matches = await queryAggregateIndex(target.indexFile, {
        name: 'skill-icon-design',
        limit: scenario.request.max_candidates,
    });
    const decision =
        matches.length === 0
            ? {
                  result: 'none',
                  reason: 'No matching capability in the two selected catalogs.',
                  installation: 'not authorized or attempted',
              }
            : { result: 'ambiguous' };
    assert.equal(decision.result, 'none');

    const routeInput = structuredClone(scenario.route);
    routeInput.steps[1].name = 'skill-missing-review';
    const plan = producePlan(target);
    const before = snapshot(target.evidence);
    const route = await qualifyRoute(target, routeInput);
    const result = inspectHandoff(target, route, plan);
    assert.equal(result.status, 'blocked');
    assert.match(result.reason, /required capability unavailable/);
    assert.deepEqual(snapshot(target.evidence), before);
    assert.deepEqual(snapshot(join(target.root, 'sources')), target.before);
});

for (const [label, change, reason] of [
    [
        'name-only collision',
        (route) => {
            delete route.steps[1].source_id;
        },
        /ambiguous package identity/,
    ],
    [
        'same-name near miss',
        (route) => {
            route.steps[1].source_id = 'cedar';
        },
        /different capability/,
    ],
    [
        'extra stage',
        (route) => {
            route.steps.push({ ...route.steps[1] });
        },
        /two-stage budget/,
    ],
    [
        'authority expansion',
        (route) => {
            route.steps[1].effects = ['publish'];
        },
        /expand caller or specialist authority/,
    ],
]) {
    test(`federated route blocks ${label} before returning a consumer artifact`, async (t) => {
        const target = await fixture(t);
        const routeInput = structuredClone(scenario.route);
        change(routeInput);
        const route = await qualifyRoute(target, routeInput);
        assert.equal(route.status, 'blocked');
        assert.match(route.reason, reason);
        assert.deepEqual(fs.readdirSync(target.evidence), []);
        assert.deepEqual(snapshot(join(target.root, 'sources')), target.before);
    });
}

test('package instruction drift blocks even when the catalog metadata still matches', async (t) => {
    const target = await fixture(t);
    const directory = target.sources.get('meadow');
    fs.appendFileSync(
        join(directory, '.agents/skills/skill-review/SKILL.md'),
        '\nA changed procedure.\n',
    );
    assert.equal(checkCatalog(directory).changed, false);
    const changed = snapshot(join(target.root, 'sources'));
    const result = await qualifyRoute(target, scenario.route);
    assert.equal(result.status, 'blocked');
    assert.match(result.reason, /package content changed/);
    assert.deepEqual(fs.readdirSync(target.evidence), []);
    assert.deepEqual(snapshot(join(target.root, 'sources')), changed);
});

for (const [label, prepare, reason] of [
    [
        'changed bytes',
        (target, artifact) => {
            fs.appendFileSync(join(target.evidence, artifact.path), ' ');
        },
        /artifact changed/,
    ],
    [
        'unsupported version',
        (target, artifact) => {
            const bytes = jsonBytes({ ...scenario.plan, format: 'skill-plan/v2' });
            fs.writeFileSync(join(target.evidence, artifact.path), bytes);
            artifact.sha256 = sha256(bytes);
        },
        /artifact version is unsupported/,
    ],
    [
        'oversized input',
        (target, artifact) => {
            const bytes = Buffer.alloc(scenario.request.max_artifact_bytes + 1, 'x');
            fs.writeFileSync(join(target.evidence, artifact.path), bytes);
            artifact.sha256 = sha256(bytes);
        },
        /file exceeds/,
    ],
]) {
    test(`federated handoff preserves the producer artifact and blocks ${label}`, async (t) => {
        const target = await fixture(t);
        const route = await qualifyRoute(target, scenario.route);
        const artifact = producePlan(target);
        prepare(target, artifact);
        const before = snapshot(target.evidence);
        const result = inspectHandoff(target, route, artifact);
        assert.equal(result.status, 'blocked');
        assert.match(result.reason, reason);
        assert.deepEqual(snapshot(target.evidence), before);
        assert.deepEqual(snapshot(join(target.root, 'sources')), target.before);
    });
}
