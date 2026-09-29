// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginPreparationService } from '../../../src/service/PluginPreparationService.ts';
import { ProjectConfiguration } from '../../../src/config/ProjectConfiguration.ts';

test('final relative path length is validated before the artifact writer is called', () => {
    const configuration = new ProjectConfiguration({ root: '/synthetic-source' });
    const prefix = 'skills/example-skill/' + ('d'.repeat(200) + '/').repeat(4);
    const source = {
        version: '1.0.0',
        description: 'Synthetic skill.',
        homepage: 'https://example.com',
        repository: 'https://example.com/skills.git',
        license: 'Apache-2.0',
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
