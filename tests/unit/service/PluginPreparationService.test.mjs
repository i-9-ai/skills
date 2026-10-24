// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginPreparationService } from '../../../src/service/PluginPreparationService.ts';
import { ProjectConfiguration } from '../../../src/config/ProjectConfiguration.ts';
import { SkillPanelConfiguration } from '../../../src/config/SkillPanelConfiguration.ts';

test('final relative path length is validated before the artifact writer is called', () => {
    const configuration = new ProjectConfiguration({ root: '/synthetic-source' });
    const prefix = 'skills/example-skill/' + ('d'.repeat(200) + '/').repeat(4);
    const source = {
        version: '1.0.0',
        description: 'Synthetic skill.',
        homepage: 'https://example.com',
        repository: 'https://example.com/skills.git',
        license: 'Apache-2.0',
        listing: JSON.parse(
            readFileSync(new URL('../../../.codex-plugin/plugin.json', import.meta.url)),
        ).interface,
        skills: ['example-skill'],
        files: [
            {
                path: prefix + 'f'.repeat(1024 - prefix.length),
                mode: 0o644,
                bytes: Buffer.from('synthetic'),
            },
        ],
    };
    const calls = [];
    const repository = {
        read: () => source,
        emit: (...args) => {
            calls.push(args);
            return '/synthetic-staging/i9-skills';
        },
    };
    const service = new PluginPreparationService(repository);
    assert.equal(service.prepare(configuration, '/synthetic-staging/i9-skills').written, false);
    assert.equal(calls.length, 1);
    source.files[0].path += 'f';
    for (const write of [false, true]) {
        assert.throws(
            () => service.prepare(configuration, '/synthetic-staging/i9-skills', write),
            /at most 1024 characters/,
        );
        assert.equal(calls.length, 1);
    }
});

test('panel output aliases into selected, state, global and external reference roots fail before derivation/emission', (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'i9-panel-destination-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const selected = join(root, 'selected');
    const state = join(root, 'state');
    const global = join(root, 'global');
    const external = join(root, 'external');
    for (const path of [selected, state, global, external])
        fs.mkdirSync(join(path, 'staging'), { recursive: true });
    fs.symlinkSync(external, join(global, 'reference'));
    const panel = new SkillPanelConfiguration(selected, state, global);
    const configuration = new ProjectConfiguration({ root });
    const service = new PluginPreparationService();
    let derived = 0;
    service.derive = () => {
        derived++;
        return {
            files: [{ path: 'sentinel', bytes: Buffer.from('fixture'), mode: 0o644 }],
            file_count: 1,
        };
    };
    for (const [index, path] of [selected, state, global, external].entries()) {
        const alias = join(root, 'alias-' + index);
        fs.symlinkSync(path, alias);
        for (const write of [false, true])
            assert.throws(() =>
                service.prepare(configuration, join(alias, 'staging', 'i9-skills'), write, panel),
            );
        assert.equal(fs.existsSync(join(path, 'staging', 'i9-skills')), false);
    }
    assert.equal(derived, 0);
});
