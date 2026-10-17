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
