// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    catalogFixture,
    repository,
    snapshot,
    write,
} from '../../unit/fixture/InstalledCatalogFixture.mjs';

function installedFixture(t) {
    const target = catalogFixture(t, { runtime: true });
    for (const name of ['skill-authoring', 'skills-catalog-index', 'skills-snapshot']) {
        cpSync(
            join(repository, '.agents/skills', name, 'scripts'),
            join(target.installed, '.agents/skills', name, 'scripts'),
            { recursive: true },
        );
    }
    mkdirSync(join(target.installed, 'bin'));
    copyFileSync(join(repository, 'package.json'), join(target.installed, 'package.json'));
    const executable = join(target.installed, 'bin', "i9 skills' executable.mjs");
    copyFileSync(join(repository, 'bin/index.mjs'), executable);
    chmodSync(executable, 0o755);
    const verifier = join(target.installed, 'bin', 'index.mjs');
    copyFileSync(join(repository, 'bin/index.mjs'), verifier);
    symlinkSync(join(repository, 'node_modules'), join(target.installed, 'node_modules'), 'dir');
    const selected = join(target.root, "selected CLI's executable");
    symlinkSync(executable, selected);
    const env = { ...target.environment, I9_SKILLS_PROJECT_ROOT: target.installed };
    const run = (args, cwd = target.installed) =>
        spawnSync(process.execPath, [verifier, ...args], {
            cwd,
            env,
            encoding: 'utf8',
            timeout: 10000,
        });
    return { ...target, executable, selected, env, run };
}

function command(configuration, host) {
    if (host === 'copilot') return configuration.hooks.sessionStart[0].bash;
    if (host === 'antigravity')
        return configuration['i9-available-skills'].PreInvocation[0].command;
    if (host === 'hermes') return configuration.hooks.pre_llm_call[0].command;
    return configuration.hooks.SessionStart[0].hooks[0].command;
}

function execute(target, configuration, host, cwd = target.caller) {
    const input =
        host === 'antigravity'
            ? { invocationNum: 0 }
            : host === 'hermes'
              ? { hook_event_name: 'pre_llm_call', extra: { is_first_turn: true } }
              : { hook_event_name: host === 'copilot' ? 'sessionStart' : 'SessionStart', cwd };
    const result = spawnSync('/bin/sh', ['-c', command(configuration, host)], {
        cwd,
        env: target.env,
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const envelope = host === 'codex' ? undefined : JSON.parse(result.stdout);
    return host === 'codex'
        ? result.stdout
        : host === 'copilot'
          ? envelope.additionalContext
          : host === 'antigravity'
            ? envelope.injectSteps[0].ephemeralMessage
            : host === 'hermes'
              ? envelope.context
              : envelope.hookSpecificOutput.additionalContext;
}

test('six installed session registrations discover the consumer cwd, verify exact selections and remain inert', (t) => {
    const target = installedFixture(t);
    const protectedBefore = [target.installed, target.caller, target.home].map(snapshot);
    for (const host of ['codex', 'claude', 'copilot', 'gemini', 'antigravity', 'hermes']) {
        const flags = ['--host', host, '--executable', target.selected, '--no-global'];
        const generated = target.run(['hook', 'session-config', ...flags]);
        assert.equal(generated.status, 0, generated.stderr);
        const configuration = JSON.parse(generated.stdout);
        assert.doesNotMatch(command(configuration, host), /git rev-parse|npx/);
        const filename = join(target.root, host + '.json');
        writeFileSync(filename, generated.stdout);
        const before = readFileSync(filename);
        const verified = target.run(['hook', 'verify', ...flags, '--file', filename]);
        assert.equal(verified.status, 0, verified.stderr);
        assert.deepEqual(JSON.parse(verified.stdout), { matches: true, executed: false });
        assert.equal(target.run(['hook', 'verify', '--host', host, '--file', filename]).status, 1);
        assert.deepEqual(readFileSync(filename), before);
        const context = execute(target, configuration, host);
        assert.match(context, /decoy-guide \[project\]/);
        assert.doesNotMatch(context, /alpha-guide|beta-guide|gamma-guide/);
        assert.deepEqual(
            [target.installed, target.caller, target.home].map(snapshot),
            protectedBefore,
        );
    }
    assert.equal(existsSync(join(target.home, '.agents/skills-usage.db')), false);
});

test('explicit project/global/limit selections work from a different non-Git working directory', (t) => {
    const target = installedFixture(t);
    const project = join(target.root, "chosen consumer's project");
    const global = join(target.root, "chosen global's skills");
    write(
        project,
        '.agents/skills/consumer-only/SKILL.md',
        '---\nname: consumer-only\ndescription: Caller-selected fixture.\n---\n# Guide\n',
    );
    write(
        global,
        'global-only/SKILL.md',
        '---\nname: global-only\ndescription: Explicit global fixture.\n---\n# Guide\n',
    );
    const flags = [
        '--host',
        'hermes',
        '--executable',
        target.selected,
        '--project',
        project,
        '--global-root',
        global,
        '--max-entries',
        '1',
    ];
    const generated = target.run(['hook', 'session-config', ...flags]);
    assert.equal(generated.status, 0, generated.stderr);
    const configuration = JSON.parse(generated.stdout);
    const before = [project, global, target.home, target.installed].map(snapshot);
    const context = execute(target, configuration, 'hermes');
    assert.match(context, /consumer-only \[project\]/);
    assert.match(context, /1 additional packages omitted/);
    assert.match(context, /Discovered: 2 distinct packages/);
    assert.doesNotMatch(context, /decoy-guide|alpha-guide/);
    const file = join(target.root, 'selected.json');
    writeFileSync(file, generated.stdout);
    assert.equal(target.run(['hook', 'verify', ...flags, '--file', file]).status, 0);
    assert.equal(
        target.run(['hook', 'verify', ...flags.slice(0, -1), '2', '--file', file]).status,
        1,
    );
    assert.deepEqual([project, global, target.home, target.installed].map(snapshot), before);
});

test('absent, relative, directory and non-executable runtime selections fail generation and verification', (t) => {
    const target = installedFixture(t);
    const file = join(target.root, 'configuration.json');
    const generated = target.run([
        'hook',
        'session-config',
        '--host',
        'codex',
        '--executable',
        target.selected,
    ]);
    assert.equal(generated.status, 0, generated.stderr);
    writeFileSync(file, generated.stdout);
    const unreadable = join(target.root, 'non-executable');
    writeFileSync(unreadable, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
    const before = snapshot(target.root);
    for (const executable of [
        join(target.root, 'absent'),
        './relative',
        target.caller,
        ...(process.platform === 'win32' ? [] : [unreadable]),
    ]) {
        for (const args of [['session-config'], ['verify', '--file', file]]) {
            const result = target.run([
                'hook',
                ...args,
                '--host',
                'codex',
                '--executable',
                executable,
            ]);
            assert.equal(result.status, 1);
        }
    }
    assert.deepEqual(snapshot(target.root), before);
    rmSync(target.executable);
    const unavailable = target.run([
        'hook',
        'verify',
        '--host',
        'codex',
        '--executable',
        target.selected,
        '--file',
        file,
    ]);
    assert.equal(unavailable.status, 1);
});
