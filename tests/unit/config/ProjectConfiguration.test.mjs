// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { ProjectConfiguration } from '../../../src/config/ProjectConfiguration.ts';

test('project selection preserves explicit, environment and checkout fallback precedence', () => {
    const environment = { I9_SKILLS_PROJECT_ROOT: '/environment' };
    assert.equal(
        new ProjectConfiguration({
            root: '/explicit',
            environment,
            fallbackRoot: '/fallback',
        }).root(),
        '/explicit',
    );
    assert.equal(
        new ProjectConfiguration({ environment, fallbackRoot: '/fallback' }).root(),
        '/environment',
    );
    assert.equal(
        new ProjectConfiguration({ environment: {}, fallbackRoot: '/fallback' }).root(),
        '/fallback',
    );
});

test('named project paths use one normalized root and do not follow later environment changes', () => {
    const environment = { I9_SKILLS_PROJECT_ROOT: '/fixture-root/parent/../project with spaces' };
    const configuration = new ProjectConfiguration({ environment });
    environment.I9_SKILLS_PROJECT_ROOT = '/another';

    assert.equal(configuration.root(), '/fixture-root/project with spaces');
    assert.equal(
        configuration.skillsDirectory(),
        '/fixture-root/project with spaces/.agents/skills',
    );
    assert.equal(
        configuration.codexHooksFile(),
        '/fixture-root/project with spaces/.codex/hooks.json',
    );
    assert.equal(
        configuration.catalogFile(),
        '/fixture-root/project with spaces/skills-catalog.json',
    );
});

test('relative roots resolve once and invalid selections never silently choose a fallback', () => {
    assert.equal(
        new ProjectConfiguration({ root: './synthetic/../project' }).root(),
        resolve('project'),
    );

    for (const root of ['', '   ', '\0', '\ud800', 42]) {
        assert.throws(
            () => new ProjectConfiguration({ root, fallbackRoot: '/fallback' }),
            /Project root/,
        );
    }
    assert.throws(
        () => new ProjectConfiguration({ environment: { I9_SKILLS_PROJECT_ROOT: '' } }),
        /Project root/,
    );
});
