// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
    catalogFixture,
    repository,
    snapshot,
} from '../../unit/fixture/InstalledCatalogFixture.mjs';
import { catalog, lifecycle } from '../../unit/fixture/SkillEvidenceFixture.mjs';

function run(target, host, payload, environment = {}) {
    const args = ['--host', host];
    const input = { ...payload };
    if (host === 'copilot') {
        args.push('--event', input.hook_event_name);
        delete input.hook_event_name;
    }
    const result = spawnSync(
        process.execPath,
        [join(target.installed, 'src/transport/PluginHookRunner.ts'), ...args],
        {
            cwd: target.caller,
            env: { ...target.environment, ...environment },
            input: JSON.stringify(input),
            encoding: 'utf8',
            timeout: 10000,
        },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(
        result.stderr,
        new RegExp(target.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    return result;
}

function rows(filename) {
    const database = new DatabaseSync(filename, { readOnly: true });
    try {
        return database
            .prepare('SELECT envelope FROM usage_events ORDER BY rowid')
            .all()
            .map((row) => JSON.parse(row.envelope));
    } finally {
        database.close();
    }
}

function payload(target, host, event, timestamp = '2026-09-30T12:00:00.123Z') {
    const file = join(target.caller, '.agents/skills/decoy-guide/SKILL.md');
    const session = 'private/native session ' + host;
    const base = {
        cwd: target.caller,
        hook_event_name: event,
        transcript_path: '/private/transcript-sentinel',
        prompt: 'private-prompt-sentinel',
    };
    if (host === 'copilot')
        return {
            ...base,
            sessionId: session,
            timestamp: Date.parse(timestamp),
            toolName: 'view',
            toolArgs: JSON.stringify({ path: relative(target.caller, file) }),
            toolResult: { resultType: 'success', textResultForLlm: 'private-result-sentinel' },
        };
    if (host === 'gemini')
        return {
            ...base,
            session_id: session,
            timestamp,
            tool_name: 'read_file',
            tool_input: { file_path: relative(target.caller, file) },
            tool_response: {
                llmContent: 'private-result-sentinel',
                returnDisplay: 'private-display-sentinel',
            },
        };
    if (host === 'codex')
        return {
            ...base,
            session_id: session,
            tool_name: 'Bash',
            tool_use_id: 'private-native-tool-id',
            tool_input: { command: 'cat "' + file + '"' },
            tool_response: fs.readFileSync(file, 'utf8'),
        };
    return {
        ...base,
        session_id: 'private-claude-session',
        tool_name: 'Read',
        tool_use_id: 'private-native-tool-id',
        tool_input: { file_path: file },
        tool_response: { content: 'private-result-sentinel' },
    };
}

const nativeEvents = {
    codex: ['PreToolUse', 'PostToolUse'],
    claude: ['PreToolUse', 'PostToolUse'],
    gemini: ['BeforeTool', 'AfterTool'],
    copilot: ['preToolUse', 'postToolUse'],
};

test('four native adapters share the default database even when hosts supply plugin DATA', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const legacy = join(target.data, 'skill-usage.db');
    fs.mkdirSync(target.data, { recursive: true });
    fs.writeFileSync(legacy, 'Preserve legacy database bytes without migration.\n');
    const legacyBefore = fs.readFileSync(legacy);
    const protectedBefore = [target.installed, target.caller].map(snapshot);
    const environment = {
        PLUGIN_DATA: target.data,
        CLAUDE_PLUGIN_DATA: target.data,
        COPILOT_PLUGIN_DATA: target.data,
        GEMINI_PLUGIN_DATA: target.data,
    };
    const database = join(target.home, '.agents/skills-usage.db');
    assert.equal(fs.existsSync(database), false);
    for (const host of Object.keys(nativeEvents)) {
        const [attemptName, readName] = nativeEvents[host];
        const attempt = payload(target, host, attemptName);
        const read = payload(target, host, readName, '2026-09-30T12:00:00.456Z');
        const start = {
            ...payload(target, host, host === 'copilot' ? 'sessionStart' : 'SessionStart'),
            source: 'startup',
        };
        run(target, host, start, environment);
        run(target, host, start, environment);
        run(target, host, attempt, environment);
        run(target, host, read, environment);
        run(target, host, read, environment);
    }
    const events = rows(database);
    assert.equal(events.filter((event) => event.event_type === 'session.started').length, 4);
    assert.equal(events.filter((event) => event.event_type === 'skill.read.observed').length, 4);
    assert.equal(events.filter((event) => event.event_type === 'skill.read.attempted').length, 4);
    for (const host of Object.keys(nativeEvents)) {
        const matching = events.filter(
            (event) => event.source_host === host && event.event_type !== 'session.started',
        );
        assert.equal(matching.length, 2);
        assert.equal(matching[0].payload.collection, 'project');
        assert.equal(matching[0].payload.skill, 'decoy-guide');
        assert.equal(
            matching[0].correlation_id === matching[1].correlation_id,
            host === 'codex' || host === 'claude',
        );
    }
    const beforeQuery = fs.readFileSync(database);
    const result = spawnSync(
        process.execPath,
        [join(repository, 'bin/index.mjs'), 'telemetry', 'rankings'],
        {
            cwd: target.caller,
            env: { ...target.environment, ...environment },
            encoding: 'utf8',
            timeout: 10000,
        },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rows[0].reads, 4);
    assert.deepEqual(fs.readFileSync(database), beforeQuery);
    assert.deepEqual(fs.readFileSync(legacy), legacyBefore);
    assert.deepEqual([target.installed, target.caller].map(snapshot), protectedBefore);
    const bytes = beforeQuery.toString('latin1');
    for (const privateValue of [
        target.root,
        'private-prompt-sentinel',
        'private-result-sentinel',
        'private-display-sentinel',
        'private-native-tool-id',
        '/private/transcript-sentinel',
        'private/native session',
        'cat "',
    ])
        assert.equal(bytes.includes(privateValue), false, privateValue);
});

test('valid CLI records lazily initialize shared state while invalid input and queries leave it absent', (t) => {
    const target = catalogFixture(t, { runtime: true });
    fs.rmSync(join(target.home, '.agents'), { recursive: true });
    const database = join(target.home, '.agents/skills-usage.db');
    const input = {
        schema_version: 1,
        event_type: 'skill.read.observed',
        event_id: randomUUID(),
        correlation_id: randomUUID(),
        occurred_at: '2026-09-30T12:00:00.000Z',
        source_host: 'manual',
        source_adapter: 'cli',
        session: 'synthetic-session',
        payload: { collection: 'demo', skill: 'example-skill', revision: 'unknown' },
    };
    const invoke = (command, value, environment = {}) =>
        spawnSync(
            process.execPath,
            [join(repository, 'bin/index.mjs'), 'telemetry', command, '--file', '-'],
            {
                cwd: target.caller,
                env: { ...target.environment, ...environment },
                input: JSON.stringify(value),
                encoding: 'utf8',
                timeout: 10000,
            },
        );
    const invalid = invoke('record', { ...input, private_prompt: 'private-rejected-sentinel' });
    assert.equal(invalid.status, 1);
    assert.equal(fs.existsSync(join(target.home, '.agents')), false);
    const first = invoke('record', input);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(rows(database).length, 1);
    assert.equal(fs.statSync(join(target.home, '.agents')).mode & 0o777, 0o700);
    const root = join(target.root, 'catalog-state');
    const observed = invoke('catalog-observe', catalog(), { I9_AGENT_STATE_ROOT: root });
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(rows(join(root, 'skills-usage.db')).length, 1);
    const lifecycleRoot = join(target.root, 'lifecycle-state');
    const activated = invoke('record', lifecycle(), { I9_AGENT_STATE_ROOT: lifecycleRoot });
    assert.equal(activated.status, 0, activated.stderr);
    assert.equal(rows(join(lifecycleRoot, 'skills-usage.db')).length, 1);
});

test('queries with shared or root-overridden defaults never initialize a database', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const before = snapshot(target.root);
    for (const environment of [
        {},
        { I9_AGENT_STATE_ROOT: join(target.root, 'uncreated-agent-state') },
    ]) {
        const result = spawnSync(
            process.execPath,
            [join(repository, 'bin/index.mjs'), 'telemetry', 'rankings'],
            {
                cwd: target.caller,
                env: { ...target.environment, ...environment },
                encoding: 'utf8',
                timeout: 10000,
            },
        );
        assert.equal(result.status, 1);
        assert.deepEqual(snapshot(target.root), before);
    }
});

test('native writes honor a state-root override and explicit legacy database selection', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const root = join(target.root, 'selected-state');
    run(target, 'claude', payload(target, 'claude', 'PostToolUse'), { I9_AGENT_STATE_ROOT: root });
    assert.equal(rows(join(root, 'skills-usage.db')).length, 1);
    const legacy = join(target.data, 'skill-usage.db');
    run(target, 'claude', payload(target, 'claude', 'PostToolUse'), { I9_SKILLS_USAGE_DB: legacy });
    assert.equal(rows(legacy).length, 1);
    assert.equal(fs.existsSync(join(target.home, '.agents/skills-usage.db')), false);
});

test('Codex counts exact literal cat and sed outputs while rejecting compound commands and result objects', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const database = join(target.home, '.agents/skills-usage.db');
    const base = payload(target, 'codex', 'PostToolUse');
    const file = join(target.caller, '.agents/skills/decoy-guide/SKILL.md');
    const source = fs.readFileSync(file, 'utf8');
    const sed = {
        ...base,
        tool_use_id: 'sed-tool',
        tool_input: { command: "rtk proxy sed -n '1,3p' \"" + file + '\"' },
        tool_response: source
            .split(/(?<=\n)/)
            .slice(0, 3)
            .join(''),
    };
    for (const value of [base, sed, base, sed]) run(target, 'codex', value);
    assert.equal(rows(database).length, 2);
    const before = fs.readFileSync(database);
    for (const change of [
        { tool_response: { output: source, exit_code: 0 } },
        { tool_response: source + 'truncated' },
        {
            tool_input: {
                command:
                    'cat "' + file + '"; touch "' + join(target.root, 'executed-sentinel') + '"',
            },
        },
        { tool_input: { command: 'cat $(printf secret)/SKILL.md' } },
        { tool_input: { command: 'cat "' + file + '" | cat' } },
        { tool_input: { command: 'cat "' + file + '" > /tmp/private-output' } },
        { tool_input: { command: 'cat "$HOME/.agents/skills/test/SKILL.md"' } },
        { tool_input: { command: "sed -n '1,3p' -- " + file } },
        { tool_input: { command: 'cat "' + join(target.root, 'unselected/SKILL.md') + '"' } },
    ])
        run(target, 'codex', { ...base, ...change, tool_use_id: 'unsupported-tool' });
    assert.equal(fs.existsSync(join(target.root, 'executed-sentinel')), false);
    assert.deepEqual(fs.readFileSync(database), before);
});

test('Gemini and Copilot malformed timestamps, opaque IDs, paths and failure results remain neutral', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const before = snapshot(target.root);
    for (const host of ['gemini', 'copilot']) {
        const base = payload(target, host, nativeEvents[host][1]);
        const timestamps =
            host === 'gemini'
                ? [
                      'bad',
                      '2026-02-30T00:00:00.000Z',
                      '2026-09-30T12:00:00.000Z'.repeat(500),
                      {},
                      ['2026-09-30T12:00:00.000Z'],
                  ]
                : [-1, Number.MAX_SAFE_INTEGER, NaN, Infinity, '123', 1.5];
        for (const timestamp of timestamps) run(target, host, { ...base, timestamp });
        for (const session of ['', 'a'.repeat(257), 'bad\0session', {}])
            run(target, host, {
                ...base,
                [host === 'copilot' ? 'sessionId' : 'session_id']: session,
            });
        if (host === 'gemini') {
            for (const tool_response of [
                {},
                { error: { message: 'private-failure-sentinel' }, llmContent: 'result' },
                { llmContent: null },
            ])
                run(target, host, { ...base, tool_response });
        } else {
            for (const toolResult of [
                {},
                { resultType: 'failure', textResultForLlm: 'private-failure-sentinel' },
                { resultType: 'success', textResultForLlm: {} },
            ])
                run(target, host, { ...base, toolResult });
        }
    }
    assert.deepEqual(snapshot(target.root), before);
});
