// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexTelemetryAdapter } from '../../../src/service/CodexTelemetryAdapter.ts';
import { GeminiTelemetryAdapter } from '../../../src/service/GeminiTelemetryAdapter.ts';
import { CopilotTelemetryAdapter } from '../../../src/service/CopilotTelemetryAdapter.ts';
import { HookTelemetryService } from '../../../src/service/HookTelemetryService.ts';
import { TelemetryIdentityService } from '../../../src/service/TelemetryIdentityService.ts';

const receipt = '2026-09-30T12:00:00.000Z';

test('native opaque identities are bounded and hashed rather than persisted', () => {
    const identity = new TelemetryIdentityService();
    const session = identity.identifier('native/session with spaces');
    const event = identity.event(
        'codex',
        'codex-hooks-v1',
        session,
        'native call',
        'session.started',
        receipt,
    );
    assert.match(event.event_id, /^[a-f0-9-]{36}$/);
    assert.notEqual(event.session, session);
    for (const value of ['', 'a'.repeat(257), 'bad\nline', '\ud800', 10, {}])
        assert.throws(() => identity.identifier(value));
    for (const value of [
        '2026-02-30T00:00:00.000Z',
        '2026-09-30',
        'x'.repeat(25),
        {},
        ['2026-09-30T00:00:00.000Z'],
    ])
        assert.throws(() => identity.timestamp(value, 'iso'));
    assert.equal(identity.timestamp('2026-09-30T12:00:00Z', 'iso'), receipt);
    for (const value of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])
        assert.throws(() => identity.timestamp(value, 'milliseconds'));
});

test('timestamp receipt adapters deduplicate retries but do not invent a paired call identifier', () => {
    const hosts = [
        [
            new GeminiTelemetryAdapter(),
            {
                session_id: 'gemini session',
                timestamp: receipt,
                cwd: '/project',
                hook_event_name: 'BeforeTool',
                tool_name: 'read_file',
                tool_input: { file_path: './example/SKILL.md' },
            },
            'AfterTool',
            { tool_response: { llmContent: 'result' } },
        ],
        [
            new CopilotTelemetryAdapter(),
            {
                sessionId: 'copilot session',
                timestamp: Date.parse(receipt),
                cwd: '/project',
                hook_event_name: 'preToolUse',
                toolName: 'view',
                toolArgs: { path: './example/SKILL.md' },
            },
            'postToolUse',
            { toolResult: { resultType: 'success', textResultForLlm: 'result' } },
        ],
    ];
    for (const [adapter, input, afterName, response] of hosts) {
        const attempt = adapter.observation(input, receipt);
        const after = { ...input, ...response, hook_event_name: afterName };
        const read = adapter.observation(after, receipt);
        const retry = adapter.observation(after, '2026-10-01T00:00:00.000Z');
        assert.equal(read.event.occurred_at, receipt);
        assert.deepEqual(read, retry);
        assert.notEqual(read.event.correlation_id, attempt.event.correlation_id);
        assert.equal(read.file, '/project/example/SKILL.md');
        // Two indistinguishable native same-time receipts collapse; no unsupported
        // invocation identifier or receipt order is fabricated to hide this gap.
        assert.deepEqual(
            adapter.observation({ ...after, undocumented_tool_id: 'different' }, receipt),
            read,
        );
    }
});

test('Codex performs collection identity confinement before opening a selected file', () => {
    const identities = { identify: () => undefined };
    const service = new HookTelemetryService(identities);
    const input = {
        session_id: 'synthetic',
        tool_use_id: 'read',
        cwd: '/synthetic',
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'cat /does-not-exist/SKILL.md' },
        tool_response: 'content',
    };
    assert.equal(service.observation(input, [], 'codex'), undefined);
});

test('all new adapters reject non-string native event discriminators', () => {
    for (const adapter of [
        new CodexTelemetryAdapter(),
        new GeminiTelemetryAdapter(),
        new CopilotTelemetryAdapter(),
    ]) {
        for (const hook_event_name of [['PostToolUse'], {}, null, 1])
            assert.throws(() => adapter.observation({ hook_event_name }, receipt), /event name/);
    }
});
