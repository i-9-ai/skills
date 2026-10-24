// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { skillPanelFixture } from '../fixture/SkillPanelFixture.mjs';

const start = (f, changes = {}) =>
    f.service.request({ skill: 'example-skill', kind: 'review', focus: null, ...changes });
const finish = (request, changes = {}) => ({
    request_id: request.request_id,
    outcome: 'no_changes',
    summary: 'No justified change was found in this review.',
    proposal_id: null,
    ...changes,
});

test('supporting files are inventoried and read inertly at the frozen package identity', (t) => {
    const f = skillPanelFixture(t);
    const observed = f.inspect();
    assert.equal(observed.resources.length, 4);
    const read = (resource, base_sha256 = observed.package_sha256) =>
        f.service.inspect({
            skill: 'example-skill',
            resource,
            base_sha256,
        });
    assert.match(read('references/guide.md').resource.text, /synthetic evidence/);
    assert.match(read('scripts/sentinel.mjs').resource.text, /must never run/);
    assert.equal(fs.existsSync(f.state), false);
    for (const path of [
        '../LICENSE',
        '/etc/passwd',
        'references/../LICENSE',
        '.hidden',
        'references\\guide.md',
    ])
        assert.throws(() => read(path));
    fs.writeFileSync(join(f.skill, 'references', 'binary'), Buffer.from([0, 1, 255]));
    fs.writeFileSync(join(f.skill, 'references', 'large'), 'x'.repeat(131_073));
    const base = f.inspect().package_sha256;
    assert.throws(() => read('references/guide.md'), { code: 'panel_conflict' });
    assert.throws(() => read('references/binary', base));
    assert.throws(() => read('references/large', base));
    fs.symlinkSync(join(f.root, 'outside'), join(f.skill, 'references', 'alias'));
    assert.throws(() => read('references/alias', base));
});

test('optional reading coverage is bounded source-bound agent testimony and survives exact retries', (t) => {
    const f = skillPanelFixture(t);
    const { request, instructions } = start(f);
    assert.match(instructions, /relevant linked references/);
    assert.match(instructions, /only SKILL.md/);
    const input = finish(request, { reviewed_files: ['SKILL.md', 'references/guide.md'] });
    for (const reviewed_files of [
        ['missing.md'],
        ['../escape'],
        ['SKILL.md', 'SKILL.md'],
        Array(129).fill('LICENSE'),
    ])
        assert.throws(() => f.service.complete({ ...input, reviewed_files }));
    const completed = f.service.complete(input);
    assert.deepEqual(completed.result.reviewed_files, input.reviewed_files);
    assert.deepEqual(f.service.complete(input), completed);
    assert.deepEqual(
        f.service.activity({ skill: 'example-skill' }).requests[0].result.reviewed_files,
        input.reviewed_files,
    );
    fs.appendFileSync(f.entrypoint, '\nLater edit\n');
    assert.deepEqual(
        f.service.complete(input),
        completed,
        'Retained testimony remains historical after source edits',
    );
    const later = start(f).request;
    fs.appendFileSync(f.entrypoint, '\nAnother edit\n');
    assert.throws(() => f.service.complete(finish(later, { reviewed_files: ['SKILL.md'] })), {
        code: 'panel_conflict',
    });
    assert.equal(
        fs.readFileSync(join(f.skill, 'references', 'guide.md'), 'utf8'),
        '# Reference\n\nUse synthetic evidence only.\n',
    );
});

test('coverage cannot poison retained history with an oversized result and unsupported paths are explicit', (t) => {
    const f = skillPanelFixture(t);
    const names = Array.from(
        { length: 128 },
        (_, index) => String(index).padStart(3, '0') + 'x'.repeat(197),
    );
    for (const name of names) fs.writeFileSync(join(f.skill, name), 'synthetic\n');
    fs.writeFileSync(join(f.skill, 'references', 'a'.repeat(200)), 'long path\n');
    const observation = f.inspect();
    assert.equal(observation.resource_omitted, 1);
    const { request } = start(f);
    assert.throws(() => f.service.complete(finish(request, { reviewed_files: names })), {
        code: 'invalid_input',
    });
    assert.equal(f.service.activity({ skill: 'example-skill' }).requests[0].result, null);
    const input = finish(request, {
        reviewed_files: ['SKILL.md', ...names.slice(0, 9)],
        summary: '\\"'.repeat(1000),
    });
    const result = f.service.complete(input);
    assert.deepEqual(f.service.complete(input), result);
    assert.equal(
        f.service.activity({ skill: 'example-skill' }).requests[0].result.reviewed_files.length,
        10,
    );
});

test('opening workflow history is read only and a completed no-change review survives a new service instance', (t) => {
    const f = skillPanelFixture(t);
    assert.deepEqual(f.service.activity({ skill: 'example-skill' }), {
        skill: 'example-skill',
        requests: [],
        proposals: [],
    });
    assert.equal(fs.existsSync(f.state), false);
    const { request, instructions } = start(f);
    assert.equal(request.base_sha256, f.inspect().package_sha256);
    assert.match(instructions, /skill_panel_complete/);
    assert.match(instructions, /Never call apply or recover/);
    assert.equal(f.service.activity({ skill: request.skill }).requests[0].result, null);
    assert.deepEqual(f.service.request({ request_id: request.request_id }).request, request);
    assert.equal(f.service.activity({ skill: request.skill }).requests.length, 1);
    const result = f.service.complete(finish(request));
    assert.equal(result.result.outcome, 'no_changes');
    assert.deepEqual(f.service.complete(finish(request)), result);
    const reopened = new f.service.constructor(f.configuration);
    assert.deepEqual(reopened.activity({ skill: request.skill }).requests[0].result, result.result);
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    assert.throws(() => f.service.complete(finish(request, { summary: 'A conflicting replay.' })), {
        code: 'panel_conflict',
    });
});

test('a review returns its exact retained candidate with no source writes or implicit approval', (t) => {
    const f = skillPanelFixture(t);
    const { request } = start(f, { kind: 'proposal', focus: 'Clarify required inputs.' });
    const proposal = f.propose();
    f.service.complete(
        finish(request, {
            outcome: 'proposal',
            summary: 'Clarified inputs and verification.',
            proposal_id: proposal.proposal_id,
        }),
    );
    const history = f.service.activity({ skill: request.skill });
    assert.equal(history.requests[0].result.proposal_id, proposal.proposal_id);
    assert.equal(history.proposals[0].proposal_id, proposal.proposal_id);
    assert.equal(history.proposals[0].verification, 'inspect_before_deciding');
    assert.match(
        f.service.proposal({ proposal_id: history.proposals[0].proposal_id }).diff,
        /Verify the required/,
    );
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    fs.appendFileSync(f.entrypoint, '\nA subsequent edit.\n');
    assert.equal(
        f.service.activity({ skill: request.skill }).requests[0].base_sha256,
        request.base_sha256,
    );
    assert.equal(f.service.proposal({ proposal_id: proposal.proposal_id }).source_state, 'changed');
});

test('completion refuses an unrelated proposal or a proposal based on a later source', (t) => {
    const f = skillPanelFixture(t);
    const { request } = start(f);
    fs.appendFileSync(f.entrypoint, '\nA later source.\n');
    const proposal = f.propose({ after: f.after + '\nA later source.\n' });
    assert.throws(
        () =>
            f.service.complete(
                finish(request, { outcome: 'proposal', proposal_id: proposal.proposal_id }),
            ),
        { code: 'panel_conflict' },
    );
    assert.equal(f.service.activity({ skill: request.skill }).requests[0].result, null);
    f.service.complete(
        finish(request, { outcome: 'blocked', summary: 'The source changed during the review.' }),
    );
});

test('workflow inputs are closed and stored receipts reject corruption, foreign identity and links', (t) => {
    const f = skillPanelFixture(t);
    for (const changes of [
        { kind: 'execute' },
        { focus: '' },
        { focus: 'a'.repeat(2001) },
        { extra: true },
    ])
        assert.throws(() => start(f, changes), { code: 'invalid_input' });
    const { request } = start(f);
    for (const changes of [
        { outcome: 'applied' },
        { outcome: 'proposal' },
        { proposal_id: request.request_id },
        { summary: '' },
        { extra: true },
    ])
        assert.throws(() => f.service.complete(finish(request, changes)), {
            code: 'invalid_input',
        });
    const path = join(f.state, 'request', request.request_id, 'request.json');
    const bytes = fs.readFileSync(path);
    fs.writeFileSync(path, '{}');
    assert.throws(() => f.service.activity({ skill: request.skill }));
    fs.writeFileSync(path, bytes);
    const held = path + '.original';
    fs.renameSync(path, held);
    fs.symlinkSync(held, path);
    assert.throws(() => f.service.activity({ skill: request.skill }));
});

test('request capacity is bounded without pruning old evidence', (t) => {
    const f = skillPanelFixture(t);
    for (let i = 0; i < 32; i++) start(f);
    assert.throws(() => start(f), { code: 'panel_storage_unavailable' });
    assert.equal(f.service.activity({ skill: 'example-skill' }).requests.length, 32);
});

test('an incomplete proposal cannot hide valid reviews or another skill history', (t) => {
    const f = skillPanelFixture(t);
    const { request } = start(f);
    f.service.complete(finish(request));
    const valid = f.propose();
    const pending = '00000000-0000-4000-8000-000000000001';
    fs.mkdirSync(join(f.state, pending));
    fs.writeFileSync(join(f.state, pending, 'partial.txt'), 'Retained preparation evidence.');
    assert.equal(f.service.activity({ skill: 'example-skill' }).requests.length, 1);
    assert.equal(
        f.service.activity({ skill: 'example-skill' }).proposals[0].proposal_id,
        valid.proposal_id,
    );
    assert.deepEqual(f.service.activity({ skill: 'another-skill' }).proposals, []);
    assert.equal(
        fs.readFileSync(join(f.state, pending, 'partial.txt'), 'utf8'),
        'Retained preparation evidence.',
    );
    fs.writeFileSync(join(f.state, pending, 'proposal.json'), '{}');
    assert.throws(
        () => f.service.activity({ skill: 'example-skill' }),
        'A malformed committed receipt must not be skipped',
    );
});

test('candidate byte-limit failure retains evidence without poisoning successful retry or other skills', (t) => {
    const f = skillPanelFixture(t);
    const other = join(f.collection, 'other-skill');
    fs.cpSync(f.skill, other, { recursive: true });
    fs.writeFileSync(join(other, 'SKILL.md'), f.before.replaceAll('example-skill', 'other-skill'));
    const unrelated = f.service.propose({
        skill: 'other-skill',
        base_sha256: f.service.inspect({ skill: 'other-skill' }).package_sha256,
        after: f.after.replaceAll('example-skill', 'other-skill'),
        rationale: 'Clarify the other synthetic package.',
    });
    const padding = 8_388_608 - f.inspect().bytes - 10;
    fs.writeFileSync(join(f.skill, 'padding-a'), Buffer.alloc(3_000_000, 97));
    fs.writeFileSync(join(f.skill, 'padding-b'), Buffer.alloc(3_000_000, 97));
    fs.writeFileSync(join(f.skill, 'padding-c'), Buffer.alloc(padding - 6_000_000, 97));
    assert.throws(() => f.propose());
    const pending = fs
        .readdirSync(f.state)
        .filter((id) => !fs.existsSync(join(f.state, id, 'proposal.json')));
    assert.equal(pending.length, 1);
    const retry = f.propose({ after: f.before.replace('selected', 'given') });
    assert.equal(
        f.service.activity({ skill: 'example-skill' }).proposals[0].proposal_id,
        retry.proposal_id,
    );
    assert.equal(
        f.service.activity({ skill: 'other-skill' }).proposals[0].proposal_id,
        unrelated.proposal_id,
    );
    assert.equal(fs.existsSync(join(f.state, pending[0])), true);
});
