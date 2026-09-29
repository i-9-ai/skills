// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    linkSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
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

function cli(args, cwd = repository, input) {
    return spawnSync(process.execPath, [join(repository, 'bin/index.mjs'), ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 10_000,
        input,
    });
}

function snapshot(directory) {
    return readdirSync(directory, { withFileTypes: true, recursive: true })
        .map((entry) => ({
            path: join(entry.parentPath, entry.name),
            content: entry.isFile()
                ? readFileSync(join(entry.parentPath, entry.name)).toString('base64')
                : null,
        }))
        .sort((left, right) => left.path.localeCompare(right.path));
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

test('manual context and every supported session envelope share exact guidance without writes', (t) => {
    const root = fixture(t);
    const project = join(root, 'project');
    const local = join(project, '.agents', 'skills');
    const global = join(root, 'global');
    packageAt(join(local, 'task-guide'), 'task-guide', 'Own one task output.');
    packageAt(join(local, 'skill-routing'), 'skill-routing', 'An unverified routing candidate.');
    packageAt(join(global, 'skill-routing'), 'skill-routing', 'A different routing candidate.');
    writeFileSync(
        join(local, 'task-guide', 'SKILL.md'),
        '---\nname: task-guide\ndescription: Own one task output.\nmetadata:\n  status: ready\n  activated: true\n---\nBODY_NOT_REQUESTED\n',
    );
    const flags = ['--project', project, '--global-root', global, '--max-entries', '20'];
    const before = snapshot(root);
    const manual = cli(['context', 'available-skills', ...flags]);

    assert.equal(manual.status, 0, manual.stderr);
    assert.match(manual.stdout, /Entry point: 2 skill-routing candidates/);
    assert.match(manual.stdout, /Selected route: unassessed/);
    assert.match(
        manual.stdout,
        /setup readiness, lifecycle, host usability and activation are unverified/,
    );
    assert.doesNotMatch(manual.stdout, /BODY_NOT_REQUESTED|activated: true|status: ready/);

    for (const host of ['codex', 'claude', 'copilot', 'gemini', 'antigravity', 'hermes']) {
        const input =
            host === 'antigravity'
                ? { invocationNum: 0 }
                : { hook_event_name: 'pre_llm_call', extra: { is_first_turn: true } };
        const result = cli(
            ['hook', 'session-index', '--host', host, ...flags],
            root,
            JSON.stringify(input),
        );
        assert.equal(result.status, 0, result.stderr);
        if (host === 'codex') {
            assert.equal(result.stdout, manual.stdout);
            continue;
        }

        const envelope = JSON.parse(result.stdout);
        const context =
            host === 'antigravity'
                ? envelope.injectSteps[0].ephemeralMessage
                : host === 'hermes'
                  ? envelope.context
                  : host === 'copilot'
                    ? envelope.additionalContext
                    : envelope.hookSpecificOutput.additionalContext;
        assert.equal(context, manual.stdout, host);
    }

    assert.deepEqual(snapshot(root), before);
});

test('source edits, additions, removals and invalid metadata refresh route guidance without catalog writes', (t) => {
    const root = fixture(t);
    const local = join(root, '.agents', 'skills');
    packageAt(join(local, 'existing'), 'existing', 'An initial responsibility.');
    packageAt(join(local, 'skill-routing'), 'skill-routing', 'A routing candidate.');
    const staleCatalog = '{malformed catalog intentionally left untouched';
    writeFileSync(join(root, 'skills-catalog.json'), staleCatalog);
    const args = ['context', 'available-skills', '--project', root, '--no-global'];
    const initial = cli(args);

    assert.equal(initial.status, 0, initial.stderr);
    assert.match(initial.stdout, /Entry point: 1 skill-routing candidate/);
    assert.match(initial.stdout, /An initial responsibility/);

    packageAt(join(local, 'existing'), 'renamed', 'An edited responsibility.');
    packageAt(join(local, 'new-route'), 'new-route', 'A newly available responsibility.');
    packageAt(join(local, 'invalid'), 'invalid');
    writeFileSync(join(local, 'invalid', 'SKILL.md'), Buffer.from([0xff]));
    rmSync(join(local, 'skill-routing'), { recursive: true });
    const before = snapshot(root);
    const changed = cli(args);

    assert.equal(changed.status, 0, changed.stderr);
    assert.match(changed.stdout, /no skill-routing candidate discovered in these sources/);
    assert.match(changed.stdout, /renamed \[project\]: An edited responsibility/);
    assert.match(changed.stdout, /new-route \[project\]: A newly available responsibility/);
    assert.match(changed.stdout, /Discovery warnings: 1. Coverage is incomplete/);
    assert.match(changed.stdout, /Discovered: 2 distinct packages/);
    assert.doesNotMatch(changed.stdout, /^- (existing|invalid|skill-routing) /m);
    assert.equal(cli(args).stdout, changed.stdout);
    assert.equal(readFileSync(join(root, 'skills-catalog.json'), 'utf8'), staleCatalog);
    assert.deepEqual(snapshot(root), before);
});

test('unified CLI help and invalid input preserve noninteractive failure boundaries', () => {
    assert.match(cli(['--help']).stdout, /TOPICS/);
    for (const args of [
        ['repo', 'validate', '--unknown'],
        ['repo', 'validate-official', '--unknown'],
        ['hook', 'session-index', '--max-entries', '0'],
        ['mcp', 'serve', '--unknown'],
        ['mcp', 'serve', '--db', 'relative.db'],
        ['hook', 'session-config', '--host', 'codex', '--unknown'],
    ]) {
        const result = cli(args);
        assert.notEqual(result.status, 0, args.join(' '));
        assert.ok(result.stderr.length > 0);
        assert.doesNotMatch(result.stderr, /command .*not found/i);
    }
});

test('Codex hook render and verify use the unified entry without enabling it', (t) => {
    const root = fixture(t);
    const generated = cli(['hook', 'session-config', '--host', 'codex']);
    assert.equal(generated.status, 0, generated.stderr);
    assert.deepEqual(JSON.parse(generated.stdout), new CodexHookConfiguration().codexSessionHook());
    assert.deepEqual(
        JSON.parse(readFileSync(join(repository, '.codex/hooks.json'))),
        new CodexHookConfiguration().codexSessionHook(),
    );

    const target = join(root, 'hooks.json');
    writeFileSync(target, generated.stdout);
    assert.deepEqual(
        JSON.parse(cli(['hook', 'verify', '--host', 'codex', '--file', target]).stdout),
        {
            matches: true,
            executed: false,
        },
    );
    writeFileSync(target, '{}');
    assert.equal(cli(['hook', 'verify', '--host', 'codex', '--file', target]).status, 1);
});
