// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { InstalledCollectionConfiguration } from '../../../src/config/InstalledCollectionConfiguration.ts';
import { InstalledSkillRepository } from '../../../src/repository/InstalledSkillRepository.ts';
import { catalogFixture, snapshot, write } from '../fixture/InstalledCatalogFixture.mjs';

function repository(target) {
    return new InstalledSkillRepository(new InstalledCollectionConfiguration(target.installed), {
        read() {
            assert.fail('Identity initialization must not discover or validate a catalog');
        },
    });
}

test('installed identity reads only bounded package metadata without catalog or state access', (t) => {
    const target = catalogFixture(t);
    fs.rmSync(join(target.installed, '.agents'), { recursive: true });
    fs.rmSync(join(target.installed, 'skills-catalog.json'));
    write(target.caller, 'package.json', '{"version":"1.0.0-caller-decoy"}\n');
    write(target.caller, '.git/HEAD', 'ref: refs/heads/caller-decoy\n');
    const before = snapshot(target.root);

    assert.deepEqual(repository(target).identity(), {
        package_name: '@i-9.ai/skills',
        package_version: '9.8.7',
    });
    assert.equal(fs.existsSync(target.data), false);
    assert.deepEqual(snapshot(target.root), before);
});

for (const [label, content] of [
    ['missing version', { version: undefined }],
    ['invalid version', { version: 'private-version-sentinel' }],
    ['leading-zero version', { version: '01.2.3' }],
    ['overlong version', { version: `1.2.3+${'x'.repeat(128)}` }],
    ['different package', { name: '@unrelated/skills' }],
    ['different repository', { repository: { url: 'https://example.test/private.git' } }],
    ['repository selector', { repository: { url: 'https://github.com/i-9-ai/skills.git#main' } }],
    ['nonobject repository', { repository: 'https://github.com/i-9-ai/skills' }],
    ['malformed JSON', '{"version":'],
    ['duplicate identity', '{"name":"@i-9.ai/skills","name":"@other/skills"}'],
    ['oversized manifest', ' '.repeat(65_537)],
]) {
    test(`installed identity rejects ${label} without changing any state`, (t) => {
        const target = catalogFixture(t);
        const manifest = JSON.parse(fs.readFileSync(join(target.installed, 'package.json')));
        write(
            target.installed,
            'package.json',
            typeof content === 'string' ? content : JSON.stringify({ ...manifest, ...content }),
        );
        const before = snapshot(target.root);

        assert.throws(
            () => repository(target).identity(),
            (error) => {
                assert.equal(error.code, 'catalog_unavailable');
                assert.equal(error.message.includes(target.root), false);
                assert.equal(error.message.includes('private-version-sentinel'), false);
                return true;
            },
        );
        assert.equal(fs.existsSync(target.data), false);
        assert.deepEqual(snapshot(target.root), before);
    });
}

for (const kind of ['symbolic', 'hard-linked']) {
    test(`installed identity rejects a ${kind} manifest without following external metadata`, (t) => {
        const target = catalogFixture(t);
        const manifest = join(target.installed, 'package.json');
        const external = join(target.root, 'external-package.json');
        fs.renameSync(manifest, external);
        if (kind === 'symbolic') fs.symlinkSync(external, manifest);
        if (kind === 'hard-linked') fs.linkSync(external, manifest);
        const before = snapshot(target.root);

        assert.throws(() => repository(target).identity(), { code: 'catalog_unavailable' });
        assert.deepEqual(snapshot(target.root), before);
    });
}
