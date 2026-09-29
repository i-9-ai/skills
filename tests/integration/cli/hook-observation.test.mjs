import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SkillReadRepository } from '../../../src/repository/SkillReadRepository.ts';
import { ClaudeTelemetryAdapter } from '../../../src/service/ClaudeTelemetryAdapter.ts';
import { TelemetryHookConfiguration } from '../../../src/service/TelemetryHookConfiguration.ts';

test('native Read hooks distinguish attempts/success, stable retries and privacy without host writes', (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'i9-observe-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const collection = path.join(root, 'skills');
    const skill = path.join(collection, 'demo-skill');
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(
        path.join(skill, 'SKILL.md'),
        '---\nname: demo-skill\ndescription: A synthetic skill.\n---\n# Example\n',
    );
    const db = path.join(root, 'usage.db');
    const args = [
        'bin/index.mjs',
        'hook',
        'observe',
        '--host',
        'claude',
        '--db',
        db,
        '--collection',
        'project=' + collection,
    ];
    const run = (payload) =>
        spawnSync(process.execPath, args, { input: JSON.stringify(payload), encoding: 'utf8' });
    const base = {
        session_id: 'opaque-host-session',
        tool_name: 'Read',
        tool_use_id: 'tool-1',
        tool_input: { file_path: path.join(skill, 'SKILL.md') },
        transcript_path: '/private/transcript',
        tool_response: { content: 'secret-body-not-stored' },
    };
    for (const payload of [
        { ...base, hook_event_name: 'SessionStart', source: 'startup' },
        { ...base, hook_event_name: 'SessionStart', source: 'clear' },
        { ...base, hook_event_name: 'PreToolUse' },
        { ...base, hook_event_name: 'PostToolUseFailure', error: 'sensitive-error' },
        { ...base, hook_event_name: 'PostToolUse' },
        { ...base, hook_event_name: 'PostToolUse' },
        { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash' },
        { ...base, hook_event_name: 'SessionStart', source: 'resume' },
    ]) {
        const result = run(payload);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {});
    }
    const store = new SkillReadRepository(db, { readOnly: true });
    try {
        assert.equal(store.rank().rows[0].reads, 1);
        const [bucket] = store.trends().rows;
        assert.equal(bucket.attempts, 1);
        assert.equal(bucket.session_starts, 2);
        assert.equal(bucket.reads, 1);
    } finally {
        store.close();
    }
    const bytes = fs.readFileSync(db).toString('latin1');
    for (const privateValue of [
        'secret-body-not-stored',
        '/private/transcript',
        root,
        'opaque-host-session',
        'tool-1',
    ]) {
        assert.ok(!bytes.includes(privateValue));
    }
    const before = fs.readFileSync(db);
    const malformed = run({ ...base, hook_event_name: 'PostToolUse', tool_use_id: undefined });
    assert.equal(malformed.status, 1);
    assert.deepEqual(JSON.parse(malformed.stdout), {});
    assert.ok(!malformed.stderr.includes(root));
    assert.deepEqual(fs.readFileSync(db), before);
    assert.ok(!fs.existsSync(path.join(root, '.claude')));
});

test('host first-receipt retries preserve time but reject conflicting mapped evidence', (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'i9-receipt-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const store = new SkillReadRepository(path.join(root, 'usage.db'));
    t.after(() => store.close());
    const adapter = new ClaudeTelemetryAdapter();
    const payload = {
        session_id: 'session',
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_use_id: 'tool-id',
        tool_input: { file_path: '/test/SKILL.md' },
        tool_response: {},
    };
    const first = {
        ...adapter.observation(payload, '2026-09-01T00:00:00.000Z').event,
        payload: { collection: 'demo', skill: 'example', revision: 'unknown' },
    };
    assert.equal(store.recordEvent(first, { preserveFirstReceipt: true }).recorded, true);
    const later = { ...first, occurred_at: '2026-09-02T00:00:00.000Z' };
    assert.throws(
        () => store.recordEvent(later),
        (error) => error.code === 'evidence_conflict',
    );
    assert.equal(store.recordEvent(later, { preserveFirstReceipt: true }).recorded, false);
    assert.throws(
        () =>
            store.recordEvent(
                { ...later, payload: { ...later.payload, skill: 'changed' } },
                { preserveFirstReceipt: true },
            ),
        (error) => error.code === 'evidence_conflict',
    );
    assert.equal(store.trends().rows[0].period, '2026-09-01');
    const attempt = adapter.observation(
        { ...payload, hook_event_name: 'PreToolUse' },
        first.occurred_at,
    ).event;
    assert.equal(attempt.correlation_id, first.correlation_id);
    assert.notEqual(attempt.event_id, first.event_id);
});

test('telemetry registration is inert and shell-quotes explicit local selections', () => {
    const generated = new TelemetryHookConfiguration().configuration("/data/user's $file.db", [
        "project=/example/user's $(data)/skills",
    ]);
    assert.deepEqual(Object.keys(generated.hooks), ['SessionStart', 'PreToolUse', 'PostToolUse']);
    assert.equal(generated.hooks.PreToolUse[0].matcher, '^Read$');
    assert.equal(generated.hooks.PostToolUse[0].hooks[0].timeout, 10);
    assert.match(generated.hooks.PostToolUse[0].hooks[0].command, /'"'"'/);
    assert.throws(() =>
        new TelemetryHookConfiguration().configuration('relative.db', ['project=/skills']),
    );
    assert.throws(() =>
        new TelemetryHookConfiguration().configuration('/data/db', [
            'project=/skills',
            'project=/other',
        ]),
    );
});

test('malformed host event discriminators cannot masquerade as successful reads', () => {
    const adapter = new ClaudeTelemetryAdapter();
    const payload = {
        session_id: 'session',
        tool_name: 'Read',
        tool_use_id: 'tool',
        tool_input: { file_path: '/test/SKILL.md' },
    };
    for (const name of [['PreToolUse'], ['PostToolUse'], {}, null, 1]) {
        assert.throws(
            () =>
                adapter.observation(
                    { ...payload, hook_event_name: name },
                    '2026-09-19T00:00:00.000Z',
                ),
            /event name/,
        );
    }
    assert.throws(
        () =>
            adapter.observation(
                { session_id: 'session', hook_event_name: 'SessionStart', source: ['startup'] },
                '2026-09-19T00:00:00.000Z',
            ),
        /session source/,
    );
});
