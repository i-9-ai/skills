// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { ProjectConfiguration } from '../../../src/config/ProjectConfiguration.ts';
import { AvailableSkillsService } from '../../../src/service/AvailableSkillsService.ts';

test('compact rendering uses all discovered names dynamically and discloses omissions', () => {
    const skills = ['alpha', 'beta', 'gamma'].map((name) => ({
        name,
        description: 'x'.repeat(300),
        canonicalPath: name,
        sources: ['project'],
    }));
    const result = new AvailableSkillsService().renderOverview({ skills, warnings: [] }, 2);
    assert.match(result, /alpha/);
    assert.match(result, /beta/);
    assert.doesNotMatch(result, /gamma/);
    assert.match(result, /1 additional packages omitted/);
    assert.match(result, /…/);
});

test('overview uses the configured project directory and only explicitly supplied global sources', () => {
    const project = new ProjectConfiguration({ root: '/synthetic/project' });
    const observed = [];
    const repository = {
        read(sources) {
            observed.push(sources);
            return { skills: [], warnings: [] };
        },
    };
    const service = new AvailableSkillsService();
    service.renderAvailableSkills({ project, maxEntries: 20 }, repository);
    service.renderAvailableSkills(
        { project, globalRoot: '/synthetic/global', maxEntries: 20 },
        repository,
    );

    assert.deepEqual(observed, [
        [{ directory: '/synthetic/project/.agents/skills', label: 'project' }],
        [
            { directory: '/synthetic/project/.agents/skills', label: 'project' },
            { directory: '/synthetic/global', label: 'global' },
        ],
    ]);
});

test('overview truncates descriptions at Unicode code-point boundaries', () => {
    const description = `${'a'.repeat(138)}😀${'b'.repeat(30)}`;
    const result = new AvailableSkillsService().renderOverview(
        {
            skills: [
                { name: 'example', description, canonicalPath: 'example', sources: ['project'] },
            ],
            warnings: [],
        },
        1,
    );
    assert.equal(result.isWellFormed(), true);
    assert.ok(result.includes(`${'a'.repeat(138)}😀…`));
    assert.ok(!result.includes('\ufffd'));
});
