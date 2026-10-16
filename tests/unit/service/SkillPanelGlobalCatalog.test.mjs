// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SkillPanelConfiguration } from '../../../src/config/SkillPanelConfiguration.ts';
import { SkillPanelService } from '../../../src/service/SkillPanelService.ts';
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
