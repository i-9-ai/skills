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

function cli(args, cwd = repository) {
    return spawnSync(process.execPath, [join(repository, 'bin/index.mjs'), ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 10_000,
    });
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
