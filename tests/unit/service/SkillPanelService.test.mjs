// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { SkillPanelConfiguration } from '../../../src/config/SkillPanelConfiguration.ts';
import { SkillPanelService } from '../../../src/service/SkillPanelService.ts';
import { skillPanelFixture } from '../fixture/SkillPanelFixture.mjs';

const failure = (code) => (error) => error.code === code;
const seal = (payload) =>
    JSON.stringify({
        payload,
        sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    });

test('live catalog and actual inspection never initialize proposal state', (t) => {
    const f = skillPanelFixture(t);
    assert.deepEqual(f.service.open({}).skills, [
        {
            skill: 'example-skill',
            description: 'Review one synthetic input and produce an evidenced result.',
        },
    ]);
    const observed = f.inspect();
    assert.equal(observed.text, f.before);
    assert.equal(observed.sha256, createHash('sha256').update(f.before).digest('hex'));
    assert.equal(observed.files, 4);
    assert.equal(fs.existsSync(f.state), false);
    assert.throws(() => f.service.open({ extra: true }), failure('invalid_input'));
});

test('real proposal retains original and candidate without touching source; diff is exact', (t) => {
    const f = skillPanelFixture(t);
    const proposal = f.propose();
    assert.equal(proposal.before, f.before);
    assert.equal(proposal.after, f.after);
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    assert.equal(fs.statSync(f.state).mode & 0o777, 0o700);
    assert.equal(proposal.validation.local.status, 'passed');
    assert.equal(proposal.validation.official, 'not_run');
    assert.equal(proposal.validation.behavioral, 'not_run');
    assert.match(proposal.diff, /-2\. Produce the reviewable result\./);
    assert.match(proposal.diff, /\+2\. Verify the required inputs/);
    assert.equal(
        f.service.proposal({ proposal_id: proposal.proposal_id }).candidate_sha256,
        proposal.candidate_sha256,
    );
});

test('explicit exact approval applies once, preserves other files and recovers once', (t) => {
    const f = skillPanelFixture(t);
    const beforeIdentity = f.inspect().package_sha256;
    const reference = fs.readFileSync(join(f.skill, 'references', 'guide.md'));
    const proposal = f.propose();
    for (const bad of [
        { proposal_id: proposal.proposal_id },
        { ...f.approval(proposal), approved: false },
        { ...f.approval(proposal), arbitrary: true },
    ]) {
        assert.throws(() => f.service.apply(bad), failure('invalid_input'));
    }
    assert.throws(
        () => f.service.apply(f.approval(proposal, 'recover')),
        failure('panel_conflict'),
    );
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    const applied = f.service.apply(f.approval(proposal));
    assert.equal(applied.changed, true);
    assert.equal(applied.status, 'applied');
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.after);
    assert.deepEqual(fs.readFileSync(join(f.skill, 'references', 'guide.md')), reference);
    assert.equal(f.service.apply(f.approval(proposal)).changed, false);
    assert.throws(() => f.service.recover(f.approval(proposal)), failure('panel_conflict'));
    const restored = f.service.recover(f.approval(proposal, 'recover'));
    assert.equal(restored.status, 'recovered');
    assert.equal(restored.changed, true);
    assert.equal(f.inspect().package_sha256, beforeIdentity);
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    assert.equal(f.service.recover(f.approval(proposal, 'recover')).changed, false);
    assert.throws(() => f.service.apply(f.approval(proposal)), failure('panel_conflict'));
    assert(
        fs.existsSync(join(f.state, proposal.proposal_id, 'before', 'example-skill', 'SKILL.md')),
    );
});

for (const changed of ['entrypoint', 'reference', 'mode']) {
    test('application refuses intervening ' + changed + ' changes', (t) => {
        const f = skillPanelFixture(t);
        const proposal = f.propose();
        if (changed === 'entrypoint') fs.appendFileSync(f.entrypoint, '\nIntervening edit.\n');
        if (changed === 'reference')
            fs.appendFileSync(join(f.skill, 'references', 'guide.md'), '\nIntervening evidence.\n');
        if (changed === 'mode') fs.chmodSync(f.entrypoint, 0o600);
        const actual = fs.readFileSync(f.entrypoint);
        assert.throws(() => f.service.apply(f.approval(proposal)), failure('panel_conflict'));
        assert.deepEqual(fs.readFileSync(f.entrypoint), actual);
    });
}

test('recovery refuses subsequent user edits and preserves the preimage', (t) => {
    const f = skillPanelFixture(t);
    const proposal = f.propose();
    f.service.apply(f.approval(proposal));
    fs.appendFileSync(f.entrypoint, '\nKeep this newer user change.\n');
    const changed = fs.readFileSync(f.entrypoint);
    assert.throws(
        () => f.service.recover(f.approval(proposal, 'recover')),
        failure('panel_conflict'),
    );
    assert.deepEqual(fs.readFileSync(f.entrypoint), changed);
    assert.equal(
        fs.readFileSync(
            join(f.state, proposal.proposal_id, 'before', 'example-skill', 'SKILL.md'),
            'utf8',
        ),
        f.before,
    );
});

test('local validation failure is retained honestly and blocks application', (t) => {
    const f = skillPanelFixture(t);
    const proposal = f.propose({ after: f.after + '\nSee [missing](references/missing.md).\n' });
    assert.equal(proposal.validation.local.status, 'failed');
    assert.equal(proposal.validation.official, 'not_run');
    assert.throws(() => f.service.apply(f.approval(proposal)), failure('panel_validation_failed'));
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
});

test('changed retained candidate or receipt cannot silently become an approved change', (t) => {
    const f = skillPanelFixture(t);
    const proposal = f.propose();
    fs.appendFileSync(
        join(f.state, proposal.proposal_id, 'candidate', 'example-skill', 'SKILL.md'),
        '\nTampered candidate.\n',
    );
    assert.throws(() => f.service.apply(f.approval(proposal)), failure('panel_conflict'));
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
});

test('receipt tampering, stale approval hashes, unknown fields, rename and oversized text are rejected', (t) => {
    const f = skillPanelFixture(t);
    assert.throws(() => f.propose({ extra: 'ignored?' }), failure('invalid_input'));
    assert.throws(
        () => f.propose({ after: f.after.replace('name: example-skill', 'name: renamed-skill') }),
        failure('invalid_input'),
    );
    assert.throws(
        () => f.propose({ after: f.after + 'é'.repeat(20000) }),
        failure('invalid_input'),
    );
    assert.throws(() => f.propose({ after: f.before }), failure('panel_conflict'));
    const proposal = f.propose();
    assert.throws(
        () => f.service.apply({ ...f.approval(proposal), candidate_sha256: '0'.repeat(64) }),
        failure('panel_conflict'),
    );
    const filename = join(f.state, proposal.proposal_id, 'proposal.json');
    const record = JSON.parse(fs.readFileSync(filename, 'utf8'));
    record.payload.rationale = 'Changed receipt without matching digest';
    fs.writeFileSync(filename, JSON.stringify(record));
    assert.throws(
        () => f.service.proposal({ proposal_id: proposal.proposal_id }),
        failure('panel_conflict'),
    );
});

test('collection links, hardlinked entrypoints and state links never authorize access outside selection', (t) => {
    const f = skillPanelFixture(t);
    fs.symlinkSync(f.skill, join(f.collection, 'linked-skill'));
    assert(
        f.service.open({}).warnings.some((warning) => warning.includes('skipped a package link')),
    );
    assert.throws(() => f.service.inspect({ skill: 'linked-skill' }), failure('invalid_input'));
    fs.linkSync(f.entrypoint, join(f.root, 'hardlink'));
    assert.throws(() => f.inspect(), failure('invalid_input'));
    fs.unlinkSync(join(f.root, 'hardlink'));
    fs.mkdirSync(join(f.root, 'external state'), { mode: 0o700 });
    fs.symlinkSync(join(f.root, 'external state'), f.state);
    assert.throws(() => f.propose(), failure('panel_storage_unavailable'));
    assert.equal(fs.readdirSync(join(f.root, 'external state')).length, 0);
});

test('state overlap and a concurrent mutation lock fail without deleting recovery state', (t) => {
    const f = skillPanelFixture(t);
    assert.throws(() => new SkillPanelConfiguration(f.collection, join(f.collection, 'state')));
    assert.throws(() => new SkillPanelConfiguration(f.root, f.collection));
    fs.mkdirSync(f.state, { mode: 0o700 });
    fs.writeFileSync(join(f.state, 'mutation.lock'), 'other operation');
    assert.throws(() => f.propose(), failure('panel_storage_unavailable'));
    assert.equal(fs.readFileSync(join(f.state, 'mutation.lock'), 'utf8'), 'other operation');
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
});

test('an interrupted applied write can be inspected and finalized without replaying the write', (t) => {
    const f = skillPanelFixture(t);
    const proposal = f.propose();
    const outcome = {
        proposal_id: proposal.proposal_id,
        base_sha256: proposal.base_sha256,
        candidate_sha256: proposal.candidate_sha256,
        action: 'applying',
    };
    fs.writeFileSync(join(f.state, proposal.proposal_id, 'applying.json'), seal(outcome));
    fs.writeFileSync(f.entrypoint, f.after);
    const inode = fs.statSync(f.entrypoint).ino;
    const result = f.service.apply(f.approval(proposal));
    assert.equal(result.status, 'applied');
    assert.equal(result.changed, false);
    assert.equal(fs.statSync(f.entrypoint).ino, inode);
    assert.equal(f.service.recover(f.approval(proposal, 'recover')).status, 'recovered');
});

test('packaged MCP resource has live controls and no frozen catalog or remote code', (t) => {
    const f = skillPanelFixture(t);
    const resource = f.service.resource();
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.match(resource.text, /skill_panel_propose/);
    assert.match(resource.text, /skill_panel_apply/);
    assert.match(resource.text, /skill_panel_recover/);
    assert.doesNotMatch(resource.text, /<script[^>]+src=|<link[^>]+href=|frozen public metadata/);
    const scripts = [...resource.text.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    new vm.Script(scripts[0][1]);
    assert.equal(fs.existsSync(f.state), false);
});
