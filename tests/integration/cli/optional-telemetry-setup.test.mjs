// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    cpSync,
    lstatSync,
    readdirSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const mutableLauncher = join(repositoryRoot, 'bin/index.mjs');

function cleanup(root) {
    const unseal = (directory) => {
        chmodSync(directory, 0o755);
        for (const name of readdirSync(directory)) {
            const selected = join(directory, name);
            const info = lstatSync(selected);
            if (info.isDirectory() && !info.isSymbolicLink()) unseal(selected);
        }
    };
    unseal(root);
    rmSync(root, { recursive: true, force: true });
}

function retainedLauncher(root) {
    const retained = join(root, 'retained-runtime');
    mkdirSync(retained);
    for (const relative of [
        'package.json',
        'bin',
        'src',
        'dist',
        '.agents/skills',
        'skills-catalog.json',
        'node_modules',
    ]) {
        const source = join(repositoryRoot, relative);
        if (existsSync(source)) cpSync(source, join(retained, relative), { recursive: true });
    }
    const seal = (directory) => {
        for (const name of readdirSync(directory)) {
            const selected = join(directory, name);
            const info = lstatSync(selected);
            if (info.isSymbolicLink()) continue;
            if (info.isDirectory()) {
                seal(selected);
                continue;
            }
            chmodSync(selected, info.mode & ~0o222);
        }
        chmodSync(directory, 0o555);
    };
    seal(retained);
    return join(retained, 'bin/index.mjs');
}

test('optional setup dispatch uses installed resources independently of selected caller project', (t) => {
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'i9-optional-cli-')));
    t.after(() => cleanup(fixture));
    const launcher = retainedLauncher(fixture);
    const file = join(fixture, 'settings.json');
    const selection = ['--host', 'claude', '--file', file];
    const enable = [...selection, '--collection', 'project=' + fixture];
    const env = {
        PATH: process.env.PATH,
        HOME: fixture,
        USERPROFILE: fixture,
        NODE_NO_WARNINGS: '1',
        NODE_DISABLE_COMPILE_CACHE: '1',
        I9_SKILLS_PROJECT_ROOT: join(fixture, 'caller'),
        I9_AGENT_STATE_ROOT: join(fixture, 'agent-state'),
    };
    delete env.I9_SKILLS_USAGE_DB;
    const run = (command, flags) => {
        const result = spawnSync(process.execPath, [launcher, 'hook', command, ...flags], {
            cwd: fixture,
            env,
            encoding: 'utf8',
            timeout: 15000,
        });
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
    };
    const preview = run('telemetry-enable', enable);
    assert.equal(preview.written, false);
    assert.match(preview.registration_digest, /^[a-f0-9]{64}$/);
    assert.equal(existsSync(file), false);
    const unreviewed = spawnSync(
        process.execPath,
        [launcher, 'hook', 'telemetry-enable', ...enable, '--write'],
        { cwd: fixture, env, encoding: 'utf8', timeout: 15000 },
    );
    assert.equal(unreviewed.status, 1);
    assert.equal(existsSync(file), false);
    assert.equal(
        run('telemetry-enable', [
            ...enable,
            '--write',
            '--reviewed-registration',
            preview.registration_digest,
        ]).written,
        true,
    );
    const receipt = JSON.parse(readFileSync(file + '.i9-skills.json'));
    assert.deepEqual(receipt.runtime, [realpathSync(process.execPath), realpathSync(launcher)]);
    assert.equal(receipt.database, join(fixture, 'agent-state', 'skills-usage.db'));
    assert.equal(run('telemetry-status', selection).enabled, true);
    assert.equal(run('telemetry-disable', [...selection, '--write']).enabled, false);
    assert.equal(existsSync(join(fixture, 'agent-state')), false);
});

for (const host of ['claude', 'codex', 'gemini', 'copilot']) {
    test(
        host + ': generated hooks execute attempts and successful reads in a disposable home',
        (t) => {
            const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-generated-hook-')));
            t.after(() => cleanup(root));
            const launcher = retainedLauncher(root);
            const home = join(root, 'synthetic home');
            const collection = join(root, "collection with spaces and ' quote");
            const skillFile = join(collection, 'example-skill', 'SKILL.md');
            const file = join(root, 'settings.json');
            const database = join(root, "evidence with ' quote", 'skills-usage.db');
            mkdirSync(home);
            mkdirSync(join(collection, 'example-skill'), { recursive: true });
            const skillBody =
                '---\nname: example-skill\ndescription: Exercise a synthetic hook command.\n---\n# Example\n';
            writeFileSync(skillFile, skillBody);
            const env = {
                PATH: process.env.PATH,
                HOME: home,
                USERPROFILE: home,
                NODE_NO_WARNINGS: '1',
                NODE_DISABLE_COMPILE_CACHE: '1',
            };
            const argumentsForSelection = [
                launcher,
                'hook',
                'telemetry-enable',
                '--host',
                host,
                '--file',
                file,
                '--db',
                database,
                '--collection',
                'project=' + collection,
            ];
            const preview = spawnSync(process.execPath, argumentsForSelection, {
                cwd: root,
                env,
                encoding: 'utf8',
                timeout: 15000,
            });
            assert.equal(preview.status, 0, preview.stderr);
            const enabled = spawnSync(
                process.execPath,
                [
                    ...argumentsForSelection,
                    '--write',
                    '--reviewed-registration',
                    JSON.parse(preview.stdout).registration_digest,
                ],
                {
                    cwd: root,
                    env,
                    encoding: 'utf8',
                    timeout: 15000,
                },
            );
            assert.ifError(enabled.error);
            assert.equal(enabled.status, 0, enabled.stderr);
            const settingsBefore = readFileSync(file);
            const configuration = JSON.parse(settingsBefore);
            assert.equal(existsSync(database), false);
            const events =
                host === 'copilot'
                    ? ['preToolUse', 'postToolUse']
                    : host === 'gemini'
                      ? ['BeforeTool', 'AfterTool']
                      : ['PreToolUse', 'PostToolUse'];
            for (const [index, event] of events.entries()) {
                const entry = configuration.hooks[event][0];
                const command = host === 'copilot' ? entry.bash : entry.hooks[0].command;
                const payload =
                    host === 'copilot'
                        ? {
                              sessionId: 'synthetic-copilot-session',
                              timestamp: Date.parse('2026-09-30T12:00:00.000Z') + index,
                              cwd: root,
                              toolName: 'view',
                              toolArgs: JSON.stringify({ path: skillFile }),
                              ...(index
                                  ? {
                                        toolResult: {
                                            resultType: 'success',
                                            textResultForLlm: skillBody,
                                        },
                                    }
                                  : {}),
                          }
                        : host === 'gemini'
                          ? {
                                hook_event_name: event,
                                session_id: 'synthetic-gemini-session',
                                timestamp: index
                                    ? '2026-09-30T12:00:00.001Z'
                                    : '2026-09-30T12:00:00.000Z',
                                cwd: root,
                                tool_name: 'read_file',
                                tool_input: { file_path: skillFile },
                                ...(index ? { tool_response: { llmContent: skillBody } } : {}),
                            }
                          : {
                                hook_event_name: event,
                                session_id: 'synthetic-' + host + '-session',
                                tool_use_id: 'synthetic-read-call',
                                cwd: root,
                                tool_name: host === 'codex' ? 'Bash' : 'Read',
                                tool_input:
                                    host === 'codex'
                                        ? { command: 'cat "' + skillFile + '"' }
                                        : { file_path: skillFile },
                                ...(index
                                    ? {
                                          tool_response:
                                              host === 'codex' ? skillBody : { content: skillBody },
                                      }
                                    : {}),
                            };
                const result = spawnSync('/bin/sh', ['-c', command], {
                    cwd: root,
                    env,
                    input: JSON.stringify(payload),
                    encoding: 'utf8',
                    timeout: 15000,
                });
                assert.ifError(result.error);
                assert.equal(result.status, 0, result.stderr);
                assert.equal(result.stderr, '');
                assert.equal(result.stdout.trim(), host === 'codex' ? '' : '{}');
            }
            const store = new DatabaseSync(database, { readOnly: true });
            try {
                const observed = store
                    .prepare('SELECT envelope FROM usage_events ORDER BY rowid')
                    .all()
                    .map((row) => JSON.parse(row.envelope));
                assert.deepEqual(
                    observed.map((event) => event.event_type),
                    ['skill.read.attempted', 'skill.read.observed'],
                );
                assert.equal(
                    observed.every(
                        (event) =>
                            event.source_host === host && event.payload.skill === 'example-skill',
                    ),
                    true,
                );
                assert.equal(
                    store.prepare('SELECT count(*) AS reads FROM usage_reads').get().reads,
                    1,
                );
            } finally {
                store.close();
            }
            assert.deepEqual(readFileSync(file), settingsBefore);
            assert.equal(existsSync(join(home, '.agents')), false);
        },
    );
}

test(
    'Copilot setup refuses a readable non-executable file before writing registrations',
    { skip: process.platform === 'win32' },
    (t) => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-invalid-hook-runtime-')));
        t.after(() => cleanup(root));
        const launcher = mutableLauncher;
        const executable = join(root, 'not-executable');
        const file = join(root, 'settings.json');
        writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
        const result = spawnSync(
            process.execPath,
            [
                launcher,
                'hook',
                'telemetry-enable',
                '--host',
                'copilot',
                '--file',
                file,
                '--collection',
                'project=' + root,
                '--executable',
                executable,
                '--write',
            ],
            {
                cwd: root,
                env: {
                    PATH: process.env.PATH,
                    HOME: root,
                    USERPROFILE: root,
                    NODE_NO_WARNINGS: '1',
                },
                encoding: 'utf8',
                timeout: 15000,
            },
        );
        assert.ifError(result.error);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /must be executable|running Node/);
        assert.equal(existsSync(file), false);
        assert.equal(existsSync(file + '.i9-skills.json'), false);
        assert.equal(existsSync(join(root, '.agents')), false);
    },
);
