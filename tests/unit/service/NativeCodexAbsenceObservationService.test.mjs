// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { posix } from 'node:path';
import { NativeCodexAbsenceObservationService } from '../../../src/service/NativeCodexAbsenceObservationService.ts';
import { NativePilotCodexObservationService } from '../../../src/service/NativePilotCodexObservationService.ts';
import { NativeCodexConfiguration } from '../../../src/config/NativeCodexConfiguration.ts';
import { validator } from '../../helpers/NativeCodexTranscriptFixture.mjs';
import { fixture } from '../../helpers/NativeCodexMeasuredFixture.mjs';

function absence() {
    const service = new NativeCodexAbsenceObservationService(validator);
    const input = {
        schema_version: 1,
        phase: 'baseline',
        source_tree_sha256: '1'.repeat(64),
        image_home: posix.join('/', 'home', 'node'),
        plugin_id: 'i9-skills@i9-skills',
    };
    const results = [
        {
            codexHome: posix.join('/', 'home', 'node', '.codex'),
            platformFamily: 'unix',
            platformOs: 'linux',
            userAgent: 'codex/0.160.0',
        },
        { account: null, requiresOpenaiAuth: false, workspaceRouting: null },
        { data: [{ cwd: '/pilot/consumer', skills: [], errors: [] }] },
        { data: [{ cwd: '/pilot/consumer', hooks: [], errors: [], warnings: [] }] },
        { data: [], nextCursor: null },
    ];
    return { service, input, results };
}

test('absence recipe has only initialization and four read inventories, with no trust/thread/turn', () => {
    const f = absence();
    assert.deepEqual(
        f.service.requests().map((row) => row.method),
        [
            'initialize',
            'initialized',
            'account/read',
            'skills/list',
            'hooks/list',
            'mcpServerStatus/list',
        ],
    );
    const observed = f.service.derive(
        f.input,
        f.results,
        [],
        { pid: 50123, start_ticks: '12345' },
        'http://127.0.0.1:12345/v1',
        [],
    );
    assert.equal(observed.scope, 'native-owned-absence-no-thread-no-turn');
    assert.deepEqual(observed.inventory, { skills: [], hooks: [], mcp: [] });
});

test('auth, hook/MCP entries, pagination and owned loaded skills prevent absence proof', () => {
    for (const mutate of [
        (r) => (r[1].requiresOpenaiAuth = true),
        (r) => r[2].data[0].errors.push({}),
        (r) => r[3].data[0].warnings.push({}),
        (r) => (r[4].nextCursor = 'more'),
        (r) => r[4].data.push({}),
        (r) =>
            r[2].data[0].skills.push({
                name: 'i9-skills:owned',
                path: '/pilot/source/.agents/skills/owned/SKILL.md',
                pluginId: 'i9-skills@i9-skills',
            }),
    ]) {
        const f = absence();
        mutate(f.results);
        assert.throws(() =>
            f.service.derive(
                f.input,
                f.results,
                [],
                { pid: 50123, start_ticks: '12345' },
                'http://127.0.0.1:12345/v1',
                [],
            ),
        );
    }
});

test('static absence reparse requires exact requests, zero loopback traffic, clean owned child and full inventories', async () => {
    const owned = await fixture(1);
    try {
        const f = absence();
        const report = f.service.derive(
            f.input,
            f.results,
            [],
            { pid: 50123, start_ticks: '12345' },
            'http://127.0.0.1:12345/v1',
            [],
        );
        const selected = {
            ...owned.selected,
            input: f.input,
            report: { status: 'observed', native_acceptance: false, observation: report },
            request: Buffer.from(
                f.service
                    .requests()
                    .map((row) => JSON.stringify(row) + '\n')
                    .join(''),
            ),
            stdout: Buffer.from(
                f.results
                    .map((result, index) => JSON.stringify({ id: index + 1, result }) + '\n')
                    .join(''),
            ),
            stderr: Buffer.alloc(0),
            fixture_request: Buffer.alloc(0),
            fixture_response: Buffer.alloc(0),
            fixture_metadata: { schema_version: 2, request_count: 0, exchanges: [] },
        };
        selected.identity.processes[0].argv = NativeCodexConfiguration.argv(
            report.fixture_base_url,
        );
        const projector = new NativePilotCodexObservationService(validator);
        assert.equal(projector.validateAbsence(selected).result, 'observed');
        const passive = {
            method: 'remoteControl/status/changed',
            params: {
                installationId: 'synthetic',
                serverName: 'synthetic',
                status: 'disabled',
                environmentId: null,
            },
        };
        for (const emittedAtMs of [0, Number.MAX_SAFE_INTEGER]) {
            const notification = { ...passive, emittedAtMs };
            const changed = structuredClone(selected);
            changed.stdout = Buffer.concat([
                selected.stdout,
                Buffer.from(JSON.stringify(notification) + '\n'),
            ]);
            changed.report.observation = f.service.derive(
                f.input,
                f.results,
                [notification],
                { pid: 50123, start_ticks: '12345' },
                report.fixture_base_url,
                [],
            );
            assert.equal(projector.validateAbsence(changed).result, 'observed');
        }
        for (const emittedAtMs of ['unrecognized', null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
            const changed = structuredClone(selected);
            changed.stdout = Buffer.concat([
                selected.stdout,
                Buffer.from(JSON.stringify({ ...passive, emittedAtMs }) + '\n'),
            ]);
            assert.throws(() => projector.validateAbsence(changed), /notification_envelope/);
        }
        for (const change of [
            (s) => (s.fixture_metadata.request_count = 1),
            (s) => (s.fixture_request = Buffer.from('{}')),
            (s) =>
                (s.request = Buffer.concat([
                    s.request,
                    Buffer.from('{"id":6,"method":"turn/start","params":{}}\n'),
                ])),
            (s) =>
                (s.stdout = Buffer.concat([
                    s.stdout,
                    Buffer.from('{"method":"turn/completed","params":{}}\n'),
                ])),
            (s) => (s.identity.processes[0].identity.expected_ppid = 1),
            (s) => (s.events.events[3].signal = 'SIGKILL'),
        ]) {
            const changed = structuredClone(selected);
            change(changed);
            assert.throws(() => projector.validateAbsence(changed));
        }
    } finally {
        owned.remove();
    }
});
