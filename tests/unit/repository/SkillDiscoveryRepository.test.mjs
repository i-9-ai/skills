// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    linkSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import { SkillDiscoveryRepository } from '../../../src/repository/SkillDiscoveryRepository.ts';
import { AvailableSkillsService } from '../../../src/service/AvailableSkillsService.ts';
import { CodexHookConfiguration } from '../../../src/service/CodexHookConfiguration.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-available-skills-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}

function packageAt(directory, name, description = 'A focused implementation reference.') {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        join(directory, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${description}\n---\n# Guide\n`,
    );
}

function cli(args, cwd = repository, environment = {}) {
    const temporaryHome = environment.HOME
        ? undefined
        : realpathSync(mkdtempSync(join(tmpdir(), 'i9-discovery-cli-home-')));
    try {
        return spawnSync(process.execPath, [join(repository, 'bin/index.mjs'), ...args], {
            cwd,
            encoding: 'utf8',
            timeout: 10_000,
            env: {
                PATH: process.env.PATH,
                HOME: temporaryHome,
                USERPROFILE: temporaryHome,
                NODE_NO_WARNINGS: '1',
                ...environment,
            },
        });
    } finally {
        if (temporaryHome) rmSync(temporaryHome, { recursive: true, force: true });
    }
}

test('discovery reads current project/global entrypoints, nested packages, aliases and collisions', (t) => {
    const root = fixture(t);
    const local = join(root, 'project', '.agents', 'skills');
    const global = join(root, 'global');
    packageAt(join(local, 'shared'), 'shared');
    packageAt(join(local, 'nested', 'component'), 'component');
    packageAt(join(global, 'shared'), 'shared', 'A different package with the same name.');
    symlinkSync(join(local, 'shared'), join(global, 'alias'));
    packageAt(join(global, '.system', 'private'), 'private');

    const result = new SkillDiscoveryRepository().read([
        { directory: local, label: 'project' },
        { directory: global, label: 'global' },
    ]);
    assert.equal(result.skills.length, 3);
    assert.equal(result.skills.filter((skill) => skill.name === 'shared').length, 2);
    assert.deepEqual(
        result.skills.find((skill) => skill.canonicalPath === join(local, 'shared')).sources,
        ['project', 'global'],
    );
    assert.ok(!result.skills.some((skill) => skill.name === 'private'));
    assert.deepEqual(result.warnings, []);
});

test('same-name packages in one source have deterministic canonical identity order', (t) => {
    const root = fixture(t);
    const later = join(root, 'z-source', 'router');
    const earlier = join(root, 'a-source', 'router');
    const collationEquivalent = join(root, 'a-\u200bsource', 'router');
    packageAt(later, 'skill-routing');
    packageAt(earlier, 'skill-routing');
    packageAt(collationEquivalent, 'skill-routing');
    const result = new SkillDiscoveryRepository().read([{ directory: root, label: 'project' }]);

    assert.deepEqual(
        result.skills.map((skill) => skill.canonicalPath),
        [earlier, collationEquivalent, later],
    );
    assert.deepEqual(result.warnings, []);
});

test('unsupported entrypoints and broken links do not hide valid sibling packages', (t) => {
    const root = fixture(t);
    packageAt(join(root, 'valid'), 'valid');
    packageAt(join(root, 'bad'), 'bad');
    writeFileSync(join(root, 'bad', 'SKILL.md'), Buffer.from([0xff]));
    symlinkSync(join(root, 'missing'), join(root, 'broken'));
    const result = new SkillDiscoveryRepository().read([{ directory: root, label: 'project' }]);
    assert.deepEqual(
        result.skills.map((skill) => skill.name),
        ['valid'],
    );
    assert.equal(result.warnings.length, 2);
});

test('discovery accepts standard nested host metadata but rejects YAML aliases and duplicate keys', (t) => {
    const root = fixture(t);
    packageAt(join(root, 'host'), 'host');
    writeFileSync(
        join(root, 'host', 'SKILL.md'),
        '---\nname: host\ndescription: >-\n  A complete host description.\nmetadata:\n  custom:\n    nested: true\n---\n',
    );
    packageAt(join(root, 'alias'), 'alias');
    writeFileSync(
        join(root, 'alias', 'SKILL.md'),
        '---\nname: alias\ndescription: &text example\nother: *text\n---\n',
    );
    packageAt(join(root, 'duplicate'), 'duplicate');
    writeFileSync(
        join(root, 'duplicate', 'SKILL.md'),
        '---\nname: duplicate\nname: other\ndescription: example\n---\n',
    );

    const result = new SkillDiscoveryRepository().read([{ directory: root, label: 'project' }]);
    assert.deepEqual(
        result.skills.map((skill) => skill.name),
        ['host'],
    );
    assert.equal(result.warnings.length, 2);
});

test('discovery rejects oversized, linked and hard-linked entrypoints', (t) => {
    const root = fixture(t);
    packageAt(join(root, 'large'), 'large');
    writeFileSync(join(root, 'large', 'SKILL.md'), 'x'.repeat(131073));
    const outside = join(root, 'outside.md');
    writeFileSync(outside, '---\nname: outside\ndescription: private\n---');
    mkdirSync(join(root, 'symbolic'));
    mkdirSync(join(root, 'hard'));
    symlinkSync(outside, join(root, 'symbolic', 'SKILL.md'));
    linkSync(outside, join(root, 'hard', 'SKILL.md'));

    const result = new SkillDiscoveryRepository().read([{ directory: root, label: 'project' }]);
    assert.equal(result.skills.length, 0);
    assert.equal(result.warnings.length, 3);
});

test('fresh disk metadata is used even when catalog JSON is stale or malformed', (t) => {
    const root = fixture(t);
    packageAt(join(root, '.agents', 'skills', 'new-skill'), 'new-skill');
    writeFileSync(join(root, 'skills-catalog.json'), '{bad');
    const result = cli(['context', 'available-skills', '--project', root, '--no-global']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /new-skill \[project\]/);
});

test('CLI global discovery follows shared state root and ignores native plugin DATA', (t) => {
    const root = fixture(t);
    const project = join(root, 'project');
    const home = join(root, 'home');
    const state = join(root, 'selected-agent-state');
    const hostData = join(root, 'automatic-host-data');
    mkdirSync(project);
    packageAt(join(home, '.agents/skills/home-guide'), 'home-guide');
    packageAt(join(state, 'skills/state-guide'), 'state-guide');
    packageAt(join(hostData, 'skills/cache-guide'), 'cache-guide');
    writeFileSync(join(state, 'skills-catalog.json'), '{stale synthetic catalog');
    const environment = {
        HOME: home,
        USERPROFILE: home,
        PLUGIN_DATA: hostData,
        CLAUDE_PLUGIN_DATA: hostData,
    };
    const fromHome = cli(
        ['context', 'available-skills', '--project', project],
        project,
        environment,
    );
    assert.equal(fromHome.status, 0, fromHome.stderr);
    assert.match(fromHome.stdout, /home-guide \[global\]/);
    assert.doesNotMatch(fromHome.stdout, /state-guide|cache-guide/);
    const fromState = cli(['context', 'available-skills', '--project', project], project, {
        ...environment,
        I9_AGENT_STATE_ROOT: state,
    });
    assert.equal(fromState.status, 0, fromState.stderr);
    assert.match(fromState.stdout, /state-guide \[global\]/);
    assert.doesNotMatch(fromState.stdout, /home-guide|cache-guide/);
    assert.equal(
        readFileSync(join(state, 'skills-catalog.json'), 'utf8'),
        '{stale synthetic catalog',
    );
});

test('explicit global-root and no-global retain caller selection over shared defaults', (t) => {
    const root = fixture(t);
    const project = join(root, 'project');
    const selected = join(root, 'explicit-collection');
    mkdirSync(project);
    packageAt(join(selected, 'chosen-guide'), 'chosen-guide');
    const environment = {
        HOME: join(root, 'unused-home'),
        I9_AGENT_STATE_ROOT: 'invalid-ignored-default',
    };
    const args = ['context', 'available-skills', '--project', project, '--global-root', selected];
    const explicit = cli(args, project, environment);
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.match(explicit.stdout, /chosen-guide \[global\]/);
    const disabled = cli([...args, '--no-global'], project, environment);
    assert.equal(disabled.status, 0, disabled.stderr);
    assert.doesNotMatch(disabled.stdout, /chosen-guide/);
    assert.match(disabled.stdout, /No readable skill entrypoints discovered/);
});

test('depth-limited discovery reports incomplete coverage while keeping ordinary packages', (t) => {
    const root = fixture(t);
    packageAt(join(root, 'visible'), 'visible');
    packageAt(join(root, ...Array.from({ length: 10 }, () => 'nested'), 'deep'), 'deep');
    const result = new SkillDiscoveryRepository().read([{ directory: root, label: 'global' }]);
    assert.deepEqual(
        result.skills.map((skill) => skill.name),
        ['visible'],
    );
    assert.deepEqual(result.warnings, [
        'global: discovery incomplete; directory depth limit reached.',
    ]);
});
