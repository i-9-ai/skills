// SPDX-License-Identifier: Apache-2.0
// Original fixture-only integration. No domain package is imported or executed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

const scenario = strictJson(
    fs.readFileSync(new URL('./github-family-consumer.fixture.json', import.meta.url)),
);
const license = fs.readFileSync(new URL('../../../LICENSE', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const MAX_ARTIFACT = 16_384;
const selectedSource = 'i9-github-candidate';
const formats = {
    'github-issues': {
        capability: 'issue-local-observation',
        input: 'synthetic-github-snapshot/v1',
        output: 'pilot/github-issue-observation/v1',
        effects: ['write-local-evidence'],
    },
    'github-wiki': {
        capability: 'wiki-local-preview',
        input: 'pilot/github-issue-observation/v1',
        output: 'pilot/github-wiki-preview/v1',
        effects: ['write-local-evidence'],
    },
};

function write(root, relative, bytes) {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
    return filename;
}

// Existing bounded workspace helper; no additional fixture filesystem framework.
function inventory(directory) {
    const root = new SafeRoot(directory);
    try {
        return root
            .inventory()
            .map(([relative, info]) => [
                relative,
                info.isDirectory() ? null : digest(root.readBytes(relative)),
            ])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    } finally {
        root.close();
    }
}

function entrypoint(owner, skill) {
    return [
        '---',
        `name: ${skill.name}`,
        `description: ${JSON.stringify(skill.description)}`,
        'license: Apache-2.0',
        'metadata:',
        `  author: ${JSON.stringify(owner)}`,
        `  tags: ${JSON.stringify(skill.tags.join(', '))}`,
        '---',
        '',
        `# Synthetic ${skill.name} fixture`,
        '',
        'This original test package has no remote, native-host or model readiness claim.',
        'Inspect only the supplied bounded fake records and prepare local evidence.',
        'Stop on a changed identity, unsupported artifact or unapproved effect.',
        'Its fixed test interface is declared in references/contract.json.',
        '',
    ].join('\n');
}

async function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'i9-github-family-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const sources = new Map();
    const pins = new Map();
    for (const collection of scenario.collections) {
        const directory = path.join(root, 'collections', collection.id);
        for (const skill of collection.packages) {
            const packagePath = `.agents/skills/${skill.name}`;
            const instructions = Buffer.from(entrypoint(collection.owner, skill));
            write(directory, `${packagePath}/SKILL.md`, instructions);
            write(directory, `${packagePath}/LICENSE`, license);
            write(directory, `${packagePath}/references/contract.json`, json(skill.contract));
            pins.set(`${collection.id}:${skill.name}`, {
                source_id: collection.id,
                name: skill.name,
                path: packagePath,
                source_uri: collection.source_uri,
                owner: collection.owner,
                owner_acceptance: 'synthetic-fixture-only',
                upstream_git_revision: null,
                entrypoint_sha256: digest(instructions),
                license_sha256: digest(license),
                inventory_sha256: digest(json(inventory(path.join(directory, packagePath)))),
            });
        }
        syncCatalog(directory);
        const beforeRepeat = fs.readFileSync(path.join(directory, 'skills-catalog.json'));
        syncCatalog(directory);
        assert.deepEqual(
            fs.readFileSync(path.join(directory, 'skills-catalog.json')),
            beforeRepeat,
        );
        assert.equal(checkCatalog(directory).changed, false);
        sources.set(collection.id, directory);
    }
    const consumer = path.join(root, 'standalone-handbook-consumer');
    const input = write(consumer, 'input/fake-github.json', json(scenario.snapshot));
    write(consumer, 'input/unrelated.txt', 'Unrelated caller content must survive.\n');
    const sourceArguments = [...sources].map(
        ([id, directory]) => `${id}=${path.join(directory, 'skills-catalog.json')}`,
    );
    const output = path.join(consumer, 'index');
    const built = await rebuildAggregateIndex({ sources: sourceArguments, output, format: 'json' });
    assert.equal(built.format, 'json');
    assert.equal(built.history, false);
    const index = await readAggregateIndex(built.index);
    const evidence = path.join(consumer, 'evidence');
    fs.mkdirSync(evidence);
    return {
        root,
        sources,
        pins,
        consumer,
        input,
        sourceArguments,
        output,
        index,
        indexFile: built.index,
        evidence,
    };
}

// There are two fixed stages. No selected package code is imported, evaluated
// or dispatched: the fixture below implements its own original synthetic work.
async function qualify(target, name, sourceId, effects = ['write-local-evidence']) {
    assert.ok(sourceId, 'explicit source selection is required for colliding names');
    const directory = target.sources.get(sourceId);
    assert.ok(directory, 'selected source or required companion is unavailable');
    const matches = await queryAggregateIndex(target.indexFile, { sourceId, name, limit: 4 });
    assert.equal(matches.length, 1, 'selected capability is unavailable');
    const record = matches[0];
    const pin = target.pins.get(`${sourceId}:${name}`);
    assert.ok(pin, 'no explicit fixture identity pin');
    assert.equal(record.path, pin.path, 'selected package path changed');
    const packageRoot = path.join(directory, pin.path);
    assert.ok(fs.existsSync(packageRoot), 'selected package is unavailable');
    const source = readSourceCatalog({
        id: sourceId,
        filename: path.join(directory, 'skills-catalog.json'),
    });
    const observed = target.index.sources.find((value) => value.id === sourceId);
    assert.equal(source.catalog_sha256, observed.catalog_sha256, 'catalog changed since discovery');
    assert.equal(checkCatalog(directory).changed, false);
    assert.equal(
        digest(json(inventory(packageRoot))),
        pin.inventory_sha256,
        'complete package identity changed',
    );
    const instructions = fs.readFileSync(path.join(packageRoot, 'SKILL.md'));
    assert.equal(digest(instructions), pin.entrypoint_sha256, 'entrypoint changed');
    assert.equal(
        digest(fs.readFileSync(path.join(packageRoot, 'LICENSE'))),
        pin.license_sha256,
        'license changed',
    );
    const { source_id, path: ignoredPath, ...summary } = record;
    assert.deepEqual(
        parseSkillSummary(instructions, name),
        summary,
        'entrypoint does not match catalog',
    );
    const contract = strictJson(
        fs.readFileSync(path.join(packageRoot, 'references/contract.json')),
    );
    assert.deepEqual(contract, formats[name], 'selected capability or artifact contract differs');
    assert.deepEqual(
        effects,
        scenario.allowed_effects,
        'requested effects exceed local draft authority',
    );
    return { ...pin, catalog_sha256: source.catalog_sha256, contract };
}

function readSnapshot(target) {
    const bytes = fs.readFileSync(target.input);
    const value = strictJson(bytes, { maxBytes: MAX_ARTIFACT });
    assert.equal(value.format, formats['github-issues'].input, 'unsupported input format');
    assert.equal(
        value.repository,
        scenario.caller_repository,
        'repository identity differs from caller selection',
    );
    assert.equal(value.synthetic, true, 'only the declared synthetic input is supported');
    assert.ok(Array.isArray(value.issues) && value.issues.length <= 8, 'issue count bound');
    assert.equal(value.pagination.complete, true, 'incomplete issue evidence');
    assert.equal(value.pagination.total_count, value.issues.length, 'incomplete issue count');
    const numbers = new Set();
    for (const issue of value.issues) {
        assert.ok(
            Number.isSafeInteger(issue.number) && issue.number > 0 && !numbers.has(issue.number),
            'invalid or duplicate issue identity',
        );
        numbers.add(issue.number);
        assert.ok(['open', 'closed'].includes(issue.state), 'unsupported issue state');
        assert.ok(
            typeof issue.title === 'string' && typeof issue.body === 'string',
            'missing issue text',
        );
        assert.ok(
            Array.isArray(issue.labels) && issue.labels.every((item) => typeof item === 'string'),
            'invalid labels',
        );
        assert.equal(typeof issue.duplicate_key, 'string', 'missing synthetic duplicate key');
    }
    assert.equal(value.template.name, 'documentation-task', 'unknown repository template');
    assert.deepEqual(
        value.template.required_fields,
        ['observed', 'expected', 'source_page'],
        'unknown template fields',
    );
    return { value, sha256: digest(bytes) };
}

function artifact(target, filename, value) {
    const bytes = json(value);
    assert.ok(bytes.length <= MAX_ARTIFACT, 'artifact byte bound');
    return { filename: write(target.evidence, filename, bytes), sha256: digest(bytes) };
}

async function observeIssue(target, sourceId = selectedSource, effects) {
    await qualify(target, 'github-issues', sourceId, effects);
    const { value: snapshot, sha256 } = readSnapshot(target);
    const issue = snapshot.issues.find((value) => value.number === snapshot.target_issue);
    assert.ok(issue, 'target issue is unavailable');
    const observation = {
        format: formats['github-issues'].output,
        synthetic: true,
        repository: snapshot.repository,
        input_sha256: sha256,
        issue: {
            number: issue.number,
            state: issue.state,
            title: issue.title,
            body: issue.body,
            labels: issue.labels,
        },
        related_candidates: snapshot.issues
            .filter(
                (value) =>
                    value.number !== issue.number && value.duplicate_key === issue.duplicate_key,
            )
            .map((value) => ({
                number: value.number,
                state: value.state,
                reason: 'same synthetic duplicate key; human review required',
            })),
        coverage: {
            issue_records: snapshot.issues.length,
            complete: true,
            states: ['open', 'closed'],
        },
        proposed_next_action:
            'review existing issue and candidate before drafting any remote change',
        effects: ['write-local-evidence'],
        remote_mutation: false,
    };
    return artifact(target, 'issue-observation.json', observation);
}

function pages(records) {
    assert.ok(Array.isArray(records) && records.length <= 8, 'documentation count bound');
    const result = new Map();
    for (const item of records) {
        assert.ok(
            typeof item.path === 'string' &&
                /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(item.path),
            'unsafe documentation path',
        );
        assert.ok(!result.has(item.path), 'duplicate documentation path');
        assert.ok(
            typeof item.content === 'string' && Buffer.byteLength(item.content) <= 8_192,
            'documentation byte bound',
        );
        result.set(item.path, item.content);
    }
    return result;
}

async function previewWiki(target, producer, sourceId = selectedSource, effects) {
    await qualify(target, 'github-wiki', sourceId, effects);
    const bytes = fs.readFileSync(producer.filename);
    assert.ok(bytes.length <= MAX_ARTIFACT, 'handoff byte bound');
    assert.equal(digest(bytes), producer.sha256, 'producer artifact changed');
    const issue = strictJson(bytes, { maxBytes: MAX_ARTIFACT });
    assert.equal(issue.format, formats['github-wiki'].input, 'unsupported producer artifact');
    assert.equal(issue.synthetic, true, 'only synthetic handoffs supported');
    assert.equal(issue.repository, scenario.caller_repository, 'handoff repository differs');
    const { value: snapshot, sha256 } = readSnapshot(target);
    assert.equal(issue.input_sha256, sha256, 'input changed between observation and preview');
    assert.equal(snapshot.docs.branch, 'main', 'unselected documentation branch');
    assert.equal(snapshot.docs.merged, true, 'unmerged documentation is not a mirror source');
    assert.equal(snapshot.wiki.enabled, true, 'Wiki unavailable; retain draft for owner decision');
    assert.equal(
        snapshot.wiki.initialized,
        true,
        'Wiki uninitialized; retain draft for explicit initialization',
    );
    const source = pages(snapshot.docs.pages);
    const existing = pages(snapshot.wiki.pages);
    assert.ok(source.has('Home.md'), 'missing Wiki home');
    const excluded = [...source.keys()]
        .filter((name) => path.posix.basename(name) === 'AGENTS.md')
        .sort();
    const included = [...source.keys()].filter((name) => !excluded.includes(name)).sort();
    const changes = included
        .filter((name) => source.get(name) !== existing.get(name))
        .map((name) => ({
            path: name,
            action: existing.has(name) ? 'update' : 'create',
            content: source.get(name),
        }));
    const deletions = [...existing.keys()]
        .filter((name) => !included.includes(name))
        .sort()
        .map((name) => ({
            path: name,
            action: 'proposed-deletion',
            authorized: false,
            applied: false,
        }));
    return artifact(target, 'wiki-preview.json', {
        format: formats['github-wiki'].output,
        synthetic: true,
        repository: snapshot.repository,
        issue_observation_sha256: producer.sha256,
        changes,
        excluded_agent_instructions: excluded,
        deletions_requiring_separate_authorization: deletions,
        effects: ['write-local-evidence'],
        publication: 'not-requested',
        native_validation: 'not-run',
    });
}

function protectedBytes(target) {
    return {
        collections: inventory(path.join(target.root, 'collections')),
        inputs: inventory(path.join(target.consumer, 'input')),
        index: fs.readFileSync(target.indexFile),
    };
}

async function preservedRejection(target, producer, operation, reason) {
    const before = protectedBytes(target);
    const artifactBefore = fs.readFileSync(producer.filename);
    const evidenceBefore = inventory(target.evidence);
    await assert.rejects(operation, reason);
    assert.deepEqual(protectedBytes(target), before);
    assert.deepEqual(fs.readFileSync(producer.filename), artifactBefore);
    assert.deepEqual(inventory(target.evidence), evidenceBefore);
}

// Generic catalog/collision/resource/format refusal matrices already live in
// federated-consumer.test.mjs. This suite adds the concrete GitHub-derived case.
test('GitHub family fixture prepares local issue evidence and a standalone Wiki preview', async (t) => {
    const target = await fixture(t);
    const before = protectedBytes(target);
    const discovered = await queryAggregateIndex(target.indexFile, {
        sourceId: selectedSource,
        limit: 4,
    });
    assert.deepEqual(
        discovered.map((record) => record.name),
        ['github-issues', 'github-wiki'],
    );
    const producer = await observeIssue(target);
    const result = await previewWiki(target, producer);
    const issue = strictJson(fs.readFileSync(producer.filename));
    const preview = strictJson(fs.readFileSync(result.filename));
    assert.deepEqual(
        issue.related_candidates.map((item) => [item.number, item.state]),
        [[9, 'closed']],
    );
    assert.equal(issue.issue.number, 13);
    assert.equal(issue.issue.body, scenario.snapshot.issues[1].body);
    assert.deepEqual(preview.changes, [
        { path: 'Home.md', action: 'update', content: scenario.snapshot.docs.pages[1].content },
        { path: 'Recovery.md', action: 'create', content: scenario.snapshot.docs.pages[2].content },
    ]);
    assert.deepEqual(preview.excluded_agent_instructions, ['AGENTS.md', 'internal/AGENTS.md']);
    assert.deepEqual(preview.deletions_requiring_separate_authorization, [
        { path: 'Obsolete.md', action: 'proposed-deletion', authorized: false, applied: false },
        {
            path: 'internal/AGENTS.md',
            action: 'proposed-deletion',
            authorized: false,
            applied: false,
        },
    ]);
    assert.equal(preview.publication, 'not-requested');
    assert.equal(preview.native_validation, 'not-run');
    assert.equal(issue.remote_mutation, false);
    assert.deepEqual(protectedBytes(target), before);
    assert.deepEqual(fs.readdirSync(target.evidence).sort(), [
        'issue-observation.json',
        'wiki-preview.json',
    ]);
    assert.equal(fs.existsSync(path.join(target.consumer, '.agents')), false);
    assert.equal(fs.readFileSync(target.indexFile).includes(target.root), false);
});

for (const condition of ['partial', 'wrong-total']) {
    test(`GitHub issue evidence rejects ${condition} pagination instead of implying no closed duplicates`, async (t) => {
        const target = await fixture(t);
        const value = strictJson(fs.readFileSync(target.input));
        if (condition === 'partial') {
            value.issues = value.issues.filter((issue) => issue.state === 'open');
            value.pagination.complete = false;
        } else value.pagination.total_count += 1;
        fs.writeFileSync(target.input, json(value));
        const before = protectedBytes(target);
        await assert.rejects(() => observeIssue(target), /incomplete issue/);
        assert.deepEqual(protectedBytes(target), before);
        assert.deepEqual(fs.readdirSync(target.evidence), []);
    });
}

test('GitHub issue evidence requires the explicitly selected consumer repository', async (t) => {
    const target = await fixture(t);
    const value = strictJson(fs.readFileSync(target.input));
    value.repository = 'different-owner/handbook';
    fs.writeFileSync(target.input, json(value));
    const before = protectedBytes(target);
    await assert.rejects(() => observeIssue(target), /repository identity differs/);
    assert.deepEqual(protectedBytes(target), before);
    assert.deepEqual(fs.readdirSync(target.evidence), []);
});

for (const effect of ['publish-wiki', 'delete-wiki-page']) {
    test(`Wiki preview cannot expand the local fixture into ${effect}`, async (t) => {
        const target = await fixture(t);
        const producer = await observeIssue(target);
        await preservedRejection(
            target,
            producer,
            () => previewWiki(target, producer, selectedSource, ['write-local-evidence', effect]),
            /exceed local draft authority/,
        );
    });
}

for (const condition of ['disabled', 'uninitialized', 'unmerged', 'path-traversal']) {
    test(`Wiki ${condition} blocks its stage and retains the standalone issue observation`, async (t) => {
        const target = await fixture(t);
        const value = strictJson(fs.readFileSync(target.input));
        const reasons = {
            disabled: /Wiki unavailable/,
            uninitialized: /Wiki uninitialized/,
            unmerged: /unmerged documentation/,
            'path-traversal': /unsafe documentation path/,
        };
        if (condition === 'disabled') value.wiki.enabled = false;
        if (condition === 'uninitialized') value.wiki.initialized = false;
        if (condition === 'unmerged') value.docs.merged = false;
        if (condition === 'path-traversal') value.docs.pages[1].path = '../outside.md';
        fs.writeFileSync(target.input, json(value));
        const producer = await observeIssue(target);
        await preservedRejection(
            target,
            producer,
            () => previewWiki(target, producer),
            reasons[condition],
        );
    });
}

test('Wiki handoff rejects changed documentation without rewriting the issue observation', async (t) => {
    const target = await fixture(t);
    const producer = await observeIssue(target);
    const value = strictJson(fs.readFileSync(target.input));
    value.docs.pages[1].content += 'Concurrent synthetic change.\n';
    fs.writeFileSync(target.input, json(value));
    await preservedRejection(
        target,
        producer,
        () => previewWiki(target, producer),
        /input changed between/,
    );
});
