// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import test from 'node:test';
import { SkillPanelConfiguration } from '../../../src/config/SkillPanelConfiguration.ts';
import { SkillPanelService } from '../../../src/service/SkillPanelService.ts';
import { SkillPanelCatalogRepository } from '../../../src/repository/SkillPanelCatalogRepository.ts';
import { SkillPanelPackageRepository } from '../../../src/repository/SkillPanelPackageRepository.ts';
import { skillPanelFixture } from '../fixture/SkillPanelFixture.mjs';

function fixture(t) {
    const f = skillPanelFixture(t);
    const global = join(f.root, 'global skills');
    const packagePath = join(global, 'namespace', 'example-skill');
    fs.mkdirSync(join(global, 'namespace'), { recursive: true });
    fs.cpSync(f.skill, packagePath, { recursive: true });
    const configuration = new SkillPanelConfiguration(f.collection, f.state, global, true);
    const service = new SkillPanelService(configuration);
    const skill = service.open({}).skills.find((entry) => entry.source === 'global').skill;
    const inspect = () => service.inspect({ skill });
    const propose = (changes = {}) =>
        service.propose({
            skill,
            base_sha256: inspect().package_sha256,
            after: f.after,
            rationale: 'Clarify the global skill inputs and verification.',
            ...changes,
        });
    return {
        ...f,
        global,
        packagePath,
        configuration,
        service,
        skill,
        inspect,
        propose,
        globalEntrypoint: join(packagePath, 'SKILL.md'),
    };
}

const finish = (request, proposal) => ({
    request_id: request.request_id,
    outcome: 'proposal',
    summary: 'Clarified inputs while preserving the skill responsibility.',
    proposal_id: proposal.proposal_id,
});

test('single-target inspection and history resolution do not inventory unrelated global packages', (t) => {
    const f = fixture(t);
    for (let index = 0; index < 12; index++) {
        const name = `companion-skill-${index}`;
        const directory = join(f.global, name);
        fs.cpSync(f.packagePath, directory, { recursive: true });
        fs.writeFileSync(join(directory, 'SKILL.md'), f.before.replaceAll('example-skill', name));
    }
    const inspected = [];
    const original = SkillPanelPackageRepository.prototype.inspect;
    t.mock.method(SkillPanelPackageRepository.prototype, 'inspect', function (directory) {
        inspected.push(directory);
        return original.call(this, directory);
    });
    const catalog = new SkillPanelCatalogRepository(f.configuration);
    const all = catalog.read();
    assert.equal(
        all.skills.filter((entry) => entry.source === 'global' && !entry.read_only).length,
        13,
    );
    assert.equal(new Set(inspected).size, 13);
    for (const operation of [() => catalog.inspect(f.skill), () => catalog.target(f.skill, true)]) {
        inspected.length = 0;
        operation();
        assert(inspected.length > 0);
        assert.deepEqual([...new Set(inspected)], [f.packagePath]);
    }
    const disabled = new SkillPanelCatalogRepository(
        new SkillPanelConfiguration(f.collection, f.state, f.global),
    );
    inspected.length = 0;
    assert.equal(disabled.target(f.skill).path, f.packagePath);
    assert.deepEqual([...new Set(inspected)], [f.packagePath]);
    assert.throws(() => disabled.target(f.skill, true), { code: 'invalid_input' });

    // Narrowing package bytes must not narrow physical boundary coverage.
    fs.symlinkSync(join(f.root, 'absent'), join(f.global, 'broken-boundary'));
    inspected.length = 0;
    assert.throws(() => catalog.target(f.skill, true), { code: 'invalid_input' });
    const readonly = catalog.inspect(f.skill);
    assert.equal(readonly.read_only, true);
    assert.match(readonly.read_only_reason, /boundary coverage is incomplete/);
    assert.deepEqual(inspected, []);
});

test('explicit global evolution retains a real diff, rejects missing approval and applies/reverses only the exact global entrypoint', (t) => {
    const f = fixture(t);
    fs.chmodSync(f.globalEntrypoint, 0o640);
    fs.chmodSync(join(f.packagePath, 'scripts/sentinel.mjs'), 0o750);
    const unchanged = fs.readFileSync(join(f.packagePath, 'scripts/sentinel.mjs'));
    const row = f.service.open({}).skills.find((entry) => entry.skill === f.skill);
    assert.equal(row.source, 'global');
    assert.equal(row.read_only, false);
    assert.equal(row.read_only_reason, null);
    const observed = f.inspect();
    assert.equal(observed.source, 'global');
    assert.equal(observed.inspection_scope, 'Complete package');
    assert.match(observed.package_sha256, /^[a-f0-9]{64}$/);
    const { request, instructions } = f.service.request({
        skill: f.skill,
        kind: 'proposal',
        focus: 'Make the verification procedure explicit.',
    });
    assert.equal(request.schema_version, 2);
    assert.equal(request.source, 'global');
    assert.equal(request.read_only, false);
    assert.equal(request.name, 'example-skill');
    assert.equal(request.base_sha256, observed.package_sha256);
    assert.match(instructions, new RegExp(f.skill));
    assert.match(instructions, /Never edit the source directly/);
    const proposal = f.propose();
    assert.equal(proposal.schema_version, 2);
    assert.equal(proposal.source, 'global');
    assert.equal(proposal.skill, f.skill);
    assert.equal(proposal.name, 'example-skill');
    assert.match(proposal.global_collection_sha256, /^[a-f0-9]{64}$/);
    assert.match(proposal.diff, /Verify the required inputs/);
    assert.equal(proposal.validation.local.status, 'passed');
    assert.equal(proposal.validation.official, 'not_run');
    f.service.complete(finish(request, proposal));
    assert.equal(f.service.activity({ skill: f.skill }).requests[0].result.outcome, 'proposal');
    assert.equal(fs.readFileSync(f.globalEntrypoint, 'utf8'), f.before);
    for (const approval of [
        { ...f.approval(proposal), approved: false },
        { ...f.approval(proposal), candidate_sha256: '0'.repeat(64) },
        { ...f.approval(proposal), action: 'recover' },
    ])
        assert.throws(() => f.service.apply(approval));
    assert.equal(fs.existsSync(join(f.state, proposal.proposal_id, 'applying.json')), false);
    assert.equal(f.service.apply(f.approval(proposal)).changed, true);
    assert.equal(fs.readFileSync(f.globalEntrypoint, 'utf8'), f.after);
    assert.equal(f.service.apply(f.approval(proposal)).changed, false);
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    assert.deepEqual(fs.readFileSync(join(f.packagePath, 'scripts/sentinel.mjs')), unchanged);
    assert.equal(fs.statSync(f.globalEntrypoint).mode & 0o777, 0o640);
    assert.equal(fs.statSync(join(f.packagePath, 'scripts/sentinel.mjs')).mode & 0o777, 0o750);
    assert.equal(f.service.recover(f.approval(proposal, 'recover')).changed, true);
    assert.equal(fs.readFileSync(f.globalEntrypoint, 'utf8'), f.before);
    assert.equal(f.service.recover(f.approval(proposal, 'recover')).changed, false);
    assert(fs.existsSync(join(f.state, proposal.proposal_id, 'candidate/example-skill/SKILL.md')));
});

for (const change of ['entrypoint', 'reference', 'mode']) {
    test(`global exact approval refuses a stale ${change} without an intent or overwrite`, (t) => {
        const f = fixture(t);
        const proposal = f.propose();
        if (change === 'entrypoint') fs.appendFileSync(f.globalEntrypoint, '\nUser edit.\n');
        if (change === 'reference')
            fs.appendFileSync(join(f.packagePath, 'references/guide.md'), '\nUser edit.\n');
        if (change === 'mode') fs.chmodSync(f.globalEntrypoint, 0o600);
        const expected = fs.readFileSync(f.globalEntrypoint);
        assert.equal(
            f.service.proposal({ proposal_id: proposal.proposal_id }).source_state,
            'changed',
        );
        assert.throws(() => f.service.apply(f.approval(proposal)), { code: 'panel_conflict' });
        assert.deepEqual(fs.readFileSync(f.globalEntrypoint), expected);
        assert.equal(fs.existsSync(join(f.state, proposal.proposal_id, 'applying.json')), false);
    });
}

test('disabling global write preserves retained diffs and requests but blocks apply and recovery', (t) => {
    const f = fixture(t);
    const { request } = f.service.request({ skill: f.skill, kind: 'review', focus: null });
    const proposal = f.propose();
    f.service.complete(finish(request, proposal));
    const disabled = new SkillPanelService(
        new SkillPanelConfiguration(f.collection, f.state, f.global),
    );
    assert.equal(disabled.inspect({ skill: f.skill }).read_only, true);
    assert.equal(disabled.proposal({ proposal_id: proposal.proposal_id }).after, f.after);
    assert.equal(disabled.request({ request_id: request.request_id }).request.read_only, false);
    assert.throws(() => disabled.apply(f.approval(proposal)), { code: 'invalid_input' });
    f.service.apply(f.approval(proposal));
    assert.throws(() => disabled.recover(f.approval(proposal, 'recover')), {
        code: 'invalid_input',
    });
    assert.equal(fs.readFileSync(f.globalEntrypoint, 'utf8'), f.after);
});

test('old selected proposals and old read-only global requests retain their original schema and authority', (t) => {
    const f = fixture(t);
    const selected = new SkillPanelService(new SkillPanelConfiguration(f.collection, f.state));
    const oldProposal = selected.propose({
        skill: 'example-skill',
        base_sha256: selected.inspect({ skill: 'example-skill' }).package_sha256,
        after: f.after,
        rationale: 'A selected-copy candidate created before global opt-in.',
    });
    assert.equal(oldProposal.schema_version, 1);
    assert.equal(
        f.service.proposal({ proposal_id: oldProposal.proposal_id }).skill,
        'example-skill',
    );
    const disabled = new SkillPanelService(
        new SkillPanelConfiguration(f.collection, f.state, f.global),
    );
    const { request } = disabled.request({ skill: f.skill, kind: 'review', focus: null });
    assert.equal(request.schema_version, 1);
    assert.equal(request.read_only, true);
    const resumed = f.service.request({ request_id: request.request_id });
    assert.equal(resumed.request.read_only, true);
    assert.match(resumed.instructions, /do not edit it or create a candidate/);
    const globalProposal = f.propose();
    assert.throws(() => f.service.complete(finish(request, globalProposal)), {
        code: 'panel_conflict',
    });
    f.service.complete({
        request_id: request.request_id,
        outcome: 'findings',
        summary: 'A new editable request is required to propose this global change.',
        proposal_id: null,
    });
    assert.equal(f.service.activity({ skill: f.skill }).requests[0].read_only, true);
    assert.equal(f.service.apply(f.approval(oldProposal)).changed, true);
    assert.equal(fs.readFileSync(f.globalEntrypoint, 'utf8'), f.before);
});

test('a replaced or differently selected global root cannot reuse retained global authority', (t) => {
    const f = fixture(t);
    const { request } = f.service.request({ skill: f.skill, kind: 'proposal', focus: null });
    const proposal = f.propose();
    fs.renameSync(f.global, f.global + '-held');
    fs.cpSync(f.global + '-held', f.global, { recursive: true });
    assert.throws(() => f.service.proposal({ proposal_id: proposal.proposal_id }), {
        code: 'panel_conflict',
    });
    assert.throws(() => f.service.request({ request_id: request.request_id }), {
        code: 'panel_conflict',
    });
    assert.throws(() => f.service.apply(f.approval(proposal)), { code: 'panel_conflict' });
    assert.equal(fs.readFileSync(f.globalEntrypoint, 'utf8'), f.before);
    const other = new SkillPanelService(
        new SkillPanelConfiguration(f.collection, f.state, f.global + '-held', true),
    );
    assert.throws(() => other.proposal({ proposal_id: proposal.proposal_id }));
});

for (const unsafe of [
    'external-link',
    'package-symlink',
    'hardlink',
    'unsupported',
    'boundary-gap',
]) {
    test(`global ${unsafe} remains inspectable and read only without creating mutation state`, (t) => {
        const f = fixture(t);
        let skill = f.skill;
        if (unsafe === 'external-link') {
            const external = join(f.root, 'external-skill');
            fs.cpSync(f.packagePath, external, { recursive: true });
            fs.writeFileSync(
                join(external, 'SKILL.md'),
                f.before.replaceAll('example-skill', 'external-skill'),
            );
            fs.symlinkSync(external, join(f.global, 'external-skill'));
            skill = 'global:' + createHash('sha256').update(external).digest('hex');
        }
        if (unsafe === 'package-symlink')
            fs.symlinkSync(
                join(f.packagePath, 'references/guide.md'),
                join(f.packagePath, 'linked.md'),
            );
        if (unsafe === 'hardlink')
            fs.linkSync(join(f.packagePath, 'LICENSE'), join(f.packagePath, 'other-license'));
        if (unsafe === 'unsupported') fs.unlinkSync(join(f.packagePath, 'LICENSE'));
        if (unsafe === 'boundary-gap')
            fs.symlinkSync(join(f.root, 'absent'), join(f.global, 'broken-boundary'));
        const row = f.service.open({}).skills.find((entry) => entry.skill === skill);
        assert.equal(row.read_only, true);
        assert.equal(typeof row.read_only_reason, 'string');
        const observed = f.service.inspect({ skill });
        assert.equal(observed.read_only, true);
        assert.equal(observed.package_sha256, null);
        assert.equal(observed.inspection_scope, 'SKILL.md only');
        assert.throws(() => f.propose({ skill }), { code: 'invalid_input' });
        assert.equal(fs.existsSync(f.state), false);
    });
}

test('global system packages and a linked replacement source cannot become writable', (t) => {
    const f = fixture(t);
    fs.mkdirSync(join(f.global, '.system'));
    fs.cpSync(f.packagePath, join(f.global, '.system/example-skill'), { recursive: true });
    assert.equal(f.service.open({}).skills.filter((entry) => entry.source === 'global').length, 1);
    const proposal = f.propose();
    const external = join(f.root, 'held-package');
    fs.renameSync(f.packagePath, external);
    fs.symlinkSync(external, f.packagePath);
    assert.throws(() => f.service.apply(f.approval(proposal)));
    assert.equal(fs.readFileSync(join(external, 'SKILL.md'), 'utf8'), f.before);
});

test('global write requires its explicit collection and refuses physically overlapping state', (t) => {
    const f = fixture(t);
    assert.throws(() => new SkillPanelConfiguration(f.collection, f.state, undefined, true));
    const alias = join(f.root, 'global-alias');
    fs.symlinkSync(f.global, alias);
    const state = join(alias, 'proposals');
    const service = new SkillPanelService(
        new SkillPanelConfiguration(f.collection, state, f.global, true),
    );
    assert.equal(service.inspect({ skill: f.skill }).read_only, true);
    assert.throws(() =>
        service.propose({
            skill: f.skill,
            base_sha256: f.inspect().package_sha256,
            after: f.after,
            rationale: 'Overlapping state is forbidden.',
        }),
    );
    assert.equal(fs.existsSync(state), false);
});
