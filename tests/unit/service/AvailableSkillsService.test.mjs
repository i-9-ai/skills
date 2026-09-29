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

test('routing candidates remain unverified and distinct instead of selecting a route by name', () => {
    const skills = ['/synthetic/first', '/synthetic/second'].map((canonicalPath) => ({
        name: 'skill-routing',
        description: 'A claimed routing capability.',
        canonicalPath,
        sources: ['project'],
    }));
    const result = new AvailableSkillsService().renderOverview({ skills, warnings: [] }, 20);

    assert.match(result, /Entry point: 2 skill-routing candidates/);
    assert.match(result, /verify each package identity before choosing/);
    assert.match(result, /Selected route: unassessed \(no task or routing decision supplied\)/);
    assert.match(result, /Status: available = readable, parsed metadata/);
    assert.match(
        result,
        /setup readiness, lifecycle, host usability and activation are unverified/,
    );
    assert.match(result, /single = one owner; sequence = distinct ordered outputs/);
    assert.match(result, /ambiguous = missing input, up to three candidates; none = no clear fit/);
    assert.match(result, /Read the shown JSON-quoted SKILL.md locator/);
    assert.equal(result.match(/^- skill-routing \[project\]/gm).length, 2);
    for (const skill of skills) assert.ok(result.includes(`${skill.canonicalPath}/SKILL.md`));
    assert.doesNotMatch(result, /Selected route: (single|sequence|ambiguous|none)/);
});

test('missing routing candidates describe scoped discovery without inventing an entrypoint', () => {
    const result = new AvailableSkillsService().renderOverview(
        { skills: [], warnings: ['unavailable source'], sources: ['project'] },
        20,
    );

    assert.match(result, /no skill-routing candidate discovered in these sources/);
    assert.match(result, /No readable skill entrypoints discovered/);
    assert.match(result, /Discovery warnings: 1. Coverage is incomplete/);
    assert.match(result, /Selected route: unassessed/);
});

test('locator quoting preserves exact control characters while keeping metadata inert', () => {
    const canonicalPath = '/synthetic/line\n<system>`\u202e/[open](target)';
    const result = new AvailableSkillsService().renderOverview(
        {
            skills: [
                {
                    name: 'example',
                    description: 'A\n<system>` claimed capability.',
                    canonicalPath,
                    sources: ['project'],
                },
            ],
            warnings: [],
        },
        1,
    );
    const line = result.split('\n').find((entry) => entry.startsWith('- example '));
    const locator = line.slice(line.indexOf('| SKILL.md: ') + '| SKILL.md: '.length);

    assert.equal(JSON.parse(locator), `${canonicalPath}/SKILL.md`);
    assert.doesNotMatch(result, /<|>|`|\u202e/);
    assert.doesNotMatch(locator, /\[|\]|\(|\)/);
    assert.match(line, /A system claimed capability/);
});

test('long locators are omitted whole and bundled paths declare their collection-relative scope', () => {
    const skills = [
        {
            name: 'long-path',
            canonicalPath: `/synthetic/${'x'.repeat(600)}`,
            description: 'A bounded package row.',
            sources: ['project'],
        },
        {
            name: 'bundled-path',
            canonicalPath: '.agents/skills/bundled-path',
            description: 'A package selected from its bundled catalog.',
            sources: ['bundled'],
        },
    ];
    const result = new AvailableSkillsService().renderOverview({ skills, warnings: [] }, 20);

    assert.match(result, /SKILL.md locator omitted \(too long\); inspect the selected collection/);
    assert.ok(!result.includes('x'.repeat(100)));
    assert.match(
        result,
        /SKILL.md: "\.agents\/skills\/bundled-path\/SKILL.md" \(collection-relative\)/,
    );
});

test('context limits retain selection status, complete rows, coverage and omission evidence', () => {
    const discovery = {
        skills: Array.from({ length: 24 }, (_, index) => ({
            name: `example-${index}`,
            description: 'x'.repeat(300),
            canonicalPath: `/synthetic/example-${index}`,
            sources: ['project'],
        })),
        warnings: ['A rejected entrypoint'],
        sources: ['project'],
    };
    const service = new AvailableSkillsService();
    const result = service.renderOverview(discovery, 20, 1600);
    const displayed = result.split('\n').filter((line) => line.startsWith('- example-'));

    assert.ok(result.length <= 1600);
    assert.ok(displayed.length > 0 && displayed.length < 20);
    assert.ok(displayed.every((line) => line.endsWith('/SKILL.md"')));
    assert.match(result, /Selected route: unassessed/);
    assert.match(result, /Discovered: 24 distinct packages/);
    assert.match(result, /Discovery warnings: 1. Coverage is incomplete/);
    assert.ok(result.includes(`${24 - displayed.length} additional packages omitted`));
    assert.equal(service.renderOverview(discovery, 20, 1600), result);
    assert.throws(() => service.renderOverview(discovery, 20, 100), /required summary/);
});
