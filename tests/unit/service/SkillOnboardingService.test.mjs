// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { InstalledCollectionConfiguration } from '../../../src/config/InstalledCollectionConfiguration.ts';
import { SkillOnboardingService } from '../../../src/service/SkillOnboardingService.ts';
import { bumpFixture, treeBytes } from '../fixture/SkillBumpFixture.mjs';

test('guide queries are closed, bounded, versioned data with explicit evidence and mutation limits', () => {
    const service = new SkillOnboardingService();
    const all = service.guide();
    assert.ok(Buffer.byteLength(JSON.stringify(all)) < 65536);
    assert.equal(all.readiness.local_operations, 'implemented');
    assert.equal(all.readiness.official_validation, 'prepared_environment_required');
    assert.equal(all.examples.length, 4);
    assert.equal(
        all.examples.every((example) => example.synthetic && example.warning),
        true,
    );
    assert.deepEqual(service.guide({ section: 'bump' }).sections, [all.sections.at(-1)]);
    assert.equal(Object.hasOwn(service.guide({ section: 'audit' }), 'fixture'), false);
    for (const input of [
        null,
        [],
        { section: null },
        { section: 'private-sentinel' },
        { prompt: 'private-sentinel' },
    ]) {
        assert.throws(
            () => service.guide(input),
            (error) =>
                error.code === 'invalid_input' && !error.message.includes('private-sentinel'),
        );
    }
});

test('installed guide identity rejects missing, foreign, malformed and linked manifests without writes', (t) => {
    const target = bumpFixture(t),
        installed = path.join(target.root, 'installed');
    fs.mkdirSync(installed);
    const manifest = path.join(installed, 'package.json');
    const service = new SkillOnboardingService(new InstalledCollectionConfiguration(installed));
    const reject = () => {
        const before = treeBytes(target.root);
        assert.throws(
            () => service.guide(),
            (error) =>
                error.code === 'onboarding_unavailable' && !error.message.includes(target.root),
        );
        assert.deepEqual(treeBytes(target.root), before);
    };
    reject();
    for (const content of [
        'not-json',
        JSON.stringify({ name: 'foreign', version: '1.0.0' }),
        JSON.stringify({ name: '@i-9.ai/skills', version: 'latest' }),
    ]) {
        fs.writeFileSync(manifest, content);
        reject();
    }
    fs.writeFileSync(manifest, JSON.stringify({ name: '@i-9.ai/skills', version: '9.8.7' }));
    assert.equal(service.guide({ section: 'inspect' }).package_version, '9.8.7');
    const alias = path.join(target.root, 'manifest.json');
    fs.renameSync(manifest, alias);
    fs.symlinkSync(alias, manifest);
    reject();
});
