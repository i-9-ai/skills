// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import test from 'node:test';
import { SkillPanelConfiguration } from '../../../src/config/SkillPanelConfiguration.ts';
import { SkillPanelService } from '../../../src/service/SkillPanelService.ts';
import { SkillEvolutionRepository } from '../../../src/repository/SkillEvolutionRepository.ts';
import { skillPanelFixture } from '../fixture/SkillPanelFixture.mjs';

function fixture(t) {
    const f = skillPanelFixture(t);
    const global = join(f.root, 'global skills');
    fs.mkdirSync(global);
    const add = (directory, name = directory) => {
        const path = join(global, directory);
        fs.mkdirSync(path, { recursive: true });
        fs.writeFileSync(
            join(path, 'SKILL.md'),
            `---\nname: ${name}\ndescription: Read one global reference safely.\n---\n\n# ${name}\n\nRead the selected input.\n`,
        );
        return path;
    };
    const service = new SkillPanelService(
        new SkillPanelConfiguration(f.collection, f.state, global),
    );
    return { ...f, global, add, service };
}

test('global and selected names remain distinct while actual package aliases deduplicate', (t) => {
    const f = fixture(t);
    const path = f.add('example-skill');
    f.add('namespace/renamed-folder', 'example-skill');
    f.add('.system/hidden-skill', 'hidden-skill');
    fs.symlinkSync(path, join(f.global, 'same-package-alias'));
    fs.symlinkSync(join(f.global, 'missing-target'), join(f.global, 'broken-link'));
    const catalog = f.service.open({});
    assert.equal(catalog.total, 3);
    assert.equal(catalog.skills.length, 3);
    assert.equal(catalog.skills.filter((item) => item.name === 'example-skill').length, 3);
    assert.equal(new Set(catalog.skills.map((item) => item.skill)).size, 3);
    assert.equal(catalog.skills.filter((item) => item.source === 'global').length, 2);
    assert(catalog.warnings.some((warning) => warning.includes('broken')));
    assert.equal(fs.existsSync(f.state), false);
});

test("global inspection is live and read-only without requiring this collection's package format", (t) => {
    const f = fixture(t);
    const path = f.add('domain-tool');
    const row = f.service.open({}).skills.find((item) => item.source === 'global');
    const before = fs.readFileSync(join(path, 'SKILL.md'));
    const inspection = f.service.inspect({ skill: row.skill });
    assert.equal(inspection.name, 'domain-tool');
    assert.equal(inspection.read_only, true);
    assert.equal(inspection.package_sha256, null);
    assert.equal(inspection.text, before.toString());
    assert.match(inspection.sha256, /^[a-f0-9]{64}$/);
    assert.throws(
        () =>
            f.service.propose({
                skill: row.skill,
                base_sha256: inspection.sha256,
                after: inspection.text + '\nExtra.\n',
                rationale: 'A reference is not editable.',
            }),
        { code: 'invalid_input' },
    );
    assert.throws(() => f.service.inspect({ skill: 'global:' + '0'.repeat(64) }), {
        code: 'invalid_input',
    });
    fs.appendFileSync(join(path, 'SKILL.md'), '\nUpdated source.\n');
    assert.notEqual(f.service.inspect({ skill: row.skill }).sha256, inspection.sha256);
    assert.equal(fs.existsSync(f.state), false);
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    fs.rmSync(path, { recursive: true });
    assert.throws(() => f.service.inspect({ skill: row.skill }), { code: 'invalid_input' });
});

test('catalog pagination covers collections larger than the former 64-package limit', (t) => {
    const f = fixture(t);
    for (let index = 0; index < 140; index++) f.add('global-skill-' + index);
    const first = f.service.open({ limit: 100 });
    const second = f.service.open({ offset: first.next_offset, limit: 100 });
    assert.equal(first.total, 141);
    assert.equal(first.skills.length, 100);
    assert.equal(second.skills.length, 41);
    assert.equal(second.next_offset, null);
    assert.equal(new Set([...first.skills, ...second.skills].map((item) => item.skill)).size, 141);
    assert.equal(first.catalog_revision, second.catalog_revision);
    f.add('new-reference');
    assert.notEqual(f.service.open({}).catalog_revision, first.catalog_revision);
    for (const query of [
        { limit: 0 },
        { limit: 129 },
        { offset: -1 },
        { offset: 0.5 },
        { extra: true },
    ]) {
        assert.throws(() => f.service.open(query), { code: 'invalid_input' });
    }
});

test('global coverage failures do not hide selected skills or enable arbitrary file reads', (t) => {
    const f = fixture(t);
    const path = f.add('unreadable-skill');
    fs.renameSync(join(path, 'SKILL.md'), join(path, 'target.md'));
    fs.symlinkSync(join(path, 'target.md'), join(path, 'SKILL.md'));
    const catalog = f.service.open({});
    assert.equal(catalog.skills.length, 1);
    assert(catalog.warnings.length > 0);
    assert.throws(() => f.service.inspect({ skill: path }), { code: 'invalid_input' });
    const missing = new SkillPanelService(
        new SkillPanelConfiguration(f.collection, f.state, join(f.root, 'missing')),
    );
    assert.equal(missing.open({}).skills.length, 1);
    assert(missing.open({}).warnings.some((warning) => warning.includes('global')));
    assert.throws(() => new SkillPanelConfiguration(f.collection, f.state, f.state));
});

for (const location of ['global-root', 'linked-package', 'invalid-linked-package']) {
    for (const action of ['prepare', 'apply', 'recover']) {
        test(`${action} refuses physically global proposal state through ${location} before any write`, (t) => {
            const f = fixture(t);
            let protectedRoot = f.global;
            if (location !== 'global-root') {
                protectedRoot = join(f.root, 'external-package');
                fs.mkdirSync(protectedRoot);
                fs.writeFileSync(
                    join(protectedRoot, 'SKILL.md'),
                    '---\nname: linked-package\ndescription: An external global reference.\n---\n\n# Reference\n',
                );
                fs.symlinkSync(protectedRoot, join(f.global, 'linked-package'));
                if (location === 'invalid-linked-package') {
                    fs.writeFileSync(
                        join(protectedRoot, 'SKILL.md'),
                        '---\nname: linked-package\nname: duplicate-key\ndescription: Unsupported metadata must not authorize writes.\n---\n',
                    );
                }
            }
            fs.mkdirSync(join(protectedRoot, 'ordinary-parent'));
            const alias = join(f.root, 'protected-alias');
            fs.symlinkSync(protectedRoot, alias);
            const state = join(alias, 'ordinary-parent/private-proposals');
            const configuration = new SkillPanelConfiguration(f.collection, state, f.global);
            const panel = new SkillPanelService(configuration);
            const repository = new SkillEvolutionRepository(configuration);
            assert(panel.open({}).warnings.some((warning) => /overlap/.test(warning)));
            const input =
                action === 'prepare'
                    ? {
                          skill: 'example-skill',
                          base_sha256: f.inspect().package_sha256,
                          after: f.after,
                          rationale: 'Must not write in a global reference.',
                      }
                    : {
                          action,
                          approved: true,
                          proposal_id: '11111111-1111-4111-8111-111111111111',
                          base_sha256: '0'.repeat(64),
                          candidate_sha256: '1'.repeat(64),
                      };
            assert.throws(() => repository[action](input), { code: 'panel_storage_unavailable' });
            assert.equal(fs.existsSync(state), false);
            assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
        });
    }
}

test('global inspection preserves a leading BOM in returned text, hashes and byte counts', (t) => {
    const f = fixture(t);
    const path = f.add('bom-skill');
    const bytes = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        fs.readFileSync(join(path, 'SKILL.md')),
    ]);
    fs.writeFileSync(join(path, 'SKILL.md'), bytes);
    const row = f.service.open({}).skills.find((entry) => entry.source === 'global');
    const inspected = f.service.inspect({ skill: row.skill });
    assert.deepEqual(Buffer.from(inspected.text), bytes);
    assert.equal(
        inspected.sha256,
        createHash('sha256').update(Buffer.from(inspected.text)).digest('hex'),
    );
    assert.equal(inspected.bytes, bytes.length);
});

test('a global alias of an explicitly selected private copy preserves its existing authority', (t) => {
    const f = fixture(t);
    fs.symlinkSync(f.skill, join(f.global, 'selected-copy-alias'));
    const catalog = f.service.open({});
    assert.equal(catalog.skills.length, 1);
    assert.equal(catalog.skills[0].source, 'selected');
    assert.equal(catalog.skills[0].read_only, false);
    const proposal = f.service.propose({
        skill: 'example-skill',
        base_sha256: f.inspect().package_sha256,
        after: f.after,
        rationale: 'Retain existing selected-copy authority.',
    });
    assert.equal(proposal.status, 'proposed');
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
});

test('a global root alias cannot expose the reserved system collection', (t) => {
    const f = fixture(t);
    fs.mkdirSync(join(f.root, '.system', 'hidden-skill'), { recursive: true });
    fs.writeFileSync(
        join(f.root, '.system/hidden-skill/SKILL.md'),
        '---\nname: hidden-skill\ndescription: Reserved system package.\n---\n\n# Hidden\n',
    );
    const alias = join(f.root, 'system-alias');
    fs.symlinkSync(join(f.root, '.system'), alias);
    const service = new SkillPanelService(
        new SkillPanelConfiguration(f.collection, f.state, alias),
    );
    const result = service.open({});
    assert.equal(result.skills.length, 1);
    assert(result.warnings.length > 0);
});

test('an existing state leaf resolves physical identity even with different path casing', (t) => {
    const f = fixture(t);
    const global = join(f.root, 'GlobalReferences');
    const state = join(f.root, 'globalreferences');
    fs.mkdirSync(global, { mode: 0o700 });
    if (!fs.existsSync(state)) fs.symlinkSync(global, state);
    assert.equal(fs.realpathSync.native(global), fs.realpathSync.native(state));
    const service = new SkillPanelService(new SkillPanelConfiguration(f.collection, state, global));
    assert(service.open({}).warnings.some((warning) => /overlap/.test(warning)));
    assert.throws(
        () =>
            service.propose({
                skill: 'example-skill',
                base_sha256: f.inspect().package_sha256,
                after: f.after,
                rationale: 'An alias must not bypass the reference root.',
            }),
        { code: 'panel_storage_unavailable' },
    );
    assert.deepEqual(fs.readdirSync(global), []);
});

test('incomplete filesystem boundary discovery refuses state creation', (t) => {
    const f = fixture(t);
    fs.mkdirSync(join(f.global, ...Array.from({ length: 34 }, () => 'nested')), {
        recursive: true,
    });
    assert.throws(
        () =>
            f.service.propose({
                skill: 'example-skill',
                base_sha256: f.inspect().package_sha256,
                after: f.after,
                rationale: 'Unknown reference bounds cannot authorize a write.',
            }),
        { code: 'panel_storage_unavailable' },
    );
    assert.equal(fs.existsSync(f.state), false);
});

test('incomplete write-boundary coverage preserves available read-only references', (t) => {
    const f = fixture(t);
    f.add('available-reference');
    fs.symlinkSync(join(f.root, 'missing-reference'), join(f.global, 'broken-reference'));
    const catalog = f.service.open({});
    const reference = catalog.skills.find((entry) => entry.source === 'global');
    assert.equal(reference.name, 'available-reference');
    assert.equal(f.service.inspect({ skill: reference.skill }).read_only, true);
    assert(catalog.warnings.some((warning) => warning.includes('writes are disabled')));
    assert.throws(
        () =>
            f.service.propose({
                skill: 'example-skill',
                base_sha256: f.inspect().package_sha256,
                after: f.after,
                rationale: 'Incomplete reference bounds cannot grant write authority.',
            }),
        { code: 'panel_storage_unavailable' },
    );
    assert.equal(fs.existsSync(f.state), false);
});
