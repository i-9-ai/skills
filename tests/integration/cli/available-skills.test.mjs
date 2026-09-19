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

test('missing collections render empty context with success and no home lookup', (t) => {
    const root = fixture(t);
    const result = cli(['hook', 'session-index', '--project', root, '--no-global']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No readable skill entrypoints/);
});

test('global override and project deduplication are observable through the CLI', (t) => {
    const root = fixture(t);
    const local = join(root, 'project', '.agents', 'skills');
    const global = join(root, 'global');
    packageAt(join(local, 'shared'), 'shared');
    mkdirSync(global);
    symlinkSync(join(local, 'shared'), join(global, 'alias'));
    packageAt(join(global, 'other'), 'other');

    const result = cli([
        'context',
        'available-skills',
        '--project',
        join(root, 'project'),
        '--global-root',
        global,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /shared \[project, global\]/);
    assert.match(result.stdout, /Discovered: 2 distinct packages/);
});

test('unified CLI help and invalid input preserve noninteractive failure boundaries', () => {
    assert.match(cli(['--help']).stdout, /TOPICS/);
    for (const args of [
        ['validate', '--unknown'],
        ['ci-official', '--unknown'],
        ['hook', 'session-index', '--max-entries', '0'],
        ['mcp', 'usage'],
        ['mcp', 'usage', '--db', 'relative.db'],
        ['hook', 'codex', 'session-config', '--unknown'],
    ]) {
        const result = cli(args);
        assert.notEqual(result.status, 0, args.join(' '));
        assert.ok(result.stderr.length > 0);
    }
});

test('Codex hook render and verify use the unified entry without enabling it', (t) => {
    const root = fixture(t);
    const generated = cli(['hook', 'codex', 'session-config']);
    assert.equal(generated.status, 0, generated.stderr);
    assert.deepEqual(JSON.parse(generated.stdout), new CodexHookConfiguration().codexSessionHook());
    assert.deepEqual(
        JSON.parse(readFileSync(join(repository, '.codex/hooks.json'))),
        new CodexHookConfiguration().codexSessionHook(),
    );

    const target = join(root, 'hooks.json');
    writeFileSync(target, generated.stdout);
    assert.deepEqual(JSON.parse(cli(['hook', 'codex', 'verify', '--file', target]).stdout), {
        matches: true,
        executed: false,
    });
    writeFileSync(target, '{}');
    assert.equal(cli(['hook', 'codex', 'verify', '--file', target]).status, 1);
});
