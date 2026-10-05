import { posix as syntheticPath } from 'node:path';
const syntheticContainerHome = syntheticPath.join('/', 'home', 'node');
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
    chmodSync,
    cpSync,
    linkSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CodexJsonlCodec } from '../../src/transport/CodexJsonlCodec.ts';
import { NativeCodexSchemaRepository } from '../../src/repository/NativeCodexSchemaRepository.ts';
import { NativeCodexProtocolValidator } from '../../src/validator/NativeCodexProtocolValidator.ts';
import { CodexRpcSession } from '../../src/transport/CodexRpcSession.ts';
import {
    LoopbackResponsesFixture,
    FIXTURE_REPLY,
    FIXTURE_MODEL,
} from '../../src/transport/LoopbackResponsesFixture.ts';
import { NativeCodexObservationService } from '../../src/service/NativeCodexObservationService.ts';
import { NativeCodexObservationError } from '../../src/validator/NativeCodexObservationError.ts';
import { NativeCodexObserverDispatcher } from '../../src/service/NativeCodexObserverDispatcher.ts';
import { NativeCodexObservationRepository } from '../../src/repository/NativeCodexObservationRepository.ts';
import { NativePilotRegistrationObservationValidator } from '../../src/validator/NativePilotRegistrationObservationValidator.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const validator = new NativeCodexProtocolValidator(
    new NativeCodexSchemaRepository(join(root, 'assets/native-pilot/codex/schemas')),
);
const THREAD = '019c6e27-e55b-73d1-87d8-4e01f1f75043';
const TURN = '019c7714-3b77-74d1-9866-e1f484aae2ab';
const content = 'Synthetic selected resource.\n';
const context = 'Synthetic routing context produced by the selected native hook.';

function input(count = 1) {
    const names = [
        'skill-authoring',
        ...Array.from({ length: count - 1 }, (_, i) => `example-${String(i).padStart(3, '0')}`),
    ];
    const skills = names.map((name) => ({
        name,
        description: `Synthetic ${name} responsibility.`,
        tags: ['synthetic'],
        files: [
            {
                path: 'SKILL.md',
                sha256: sha(content),
                bytes: Buffer.byteLength(content),
            },
        ],
    }));
    const entries = skills
        .flatMap((skill) => [
            {
                path: `.agents/skills/${skill.name}`,
                kind: 'directory',
                bytes: 0,
                sha256: null,
                executable: false,
                target: null,
            },
            {
                path: `.agents/skills/${skill.name}/SKILL.md`,
                kind: 'file',
                bytes: Buffer.byteLength(content),
                sha256: sha(content),
                executable: false,
                target: null,
            },
        ])
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return {
        schema: 1,
        phase: 'install',
        imageHome: syntheticContainerHome,
        pluginId: 'i9-skills@i9-skills',
        skills,
        hooks: [
            {
                eventName: 'sessionStart',
                matcher: 'startup',
                command: 'node "$PLUGIN_ROOT/synthetic-hook.ts"',
                timeoutSec: 10,
                additionalContextLimit: 4096,
                sourceRelativePath: 'hooks/codex.json',
            },
        ],
        artifactInventory: {
            tree_sha256: sha(JSON.stringify(entries)),
            bytes: skills.length * Buffer.byteLength(content),
            entries,
        },
        resource: {
            skill: 'skill-authoring',
            resource: 'SKILL.md',
            sha256: sha(content),
            bytes: Buffer.byteLength(content),
        },
    };
}
function hook(trusted = false) {
    return {
        async: false,
        command: 'node "$PLUGIN_ROOT/synthetic-hook.ts"',
        handlerType: 'command',
        additionalContextLimit: 4096,
        currentHash: sha('synthetic hook configuration'),
        displayOrder: 0,
        enabled: true,
        eventName: 'sessionStart',
        isManaged: false,
        key: 'synthetic-exact-hook',
        matcher: 'startup',
        pluginId: 'i9-skills@i9-skills',
        source: 'plugin',
        sourcePath: '/pilot/source/hooks/codex.json',
        timeoutSec: 10,
        trustStatus: trusted ? 'trusted' : 'untrusted',
    };
}
function hookRun(status) {
    return {
        id: 'synthetic-hook-run',
        displayOrder: 0,
        entries: status === 'completed' ? [{ kind: 'context', text: context }] : [],
        eventName: 'sessionStart',
        executionMode: 'sync',
        handlerType: 'command',
        scope: 'thread',
        source: 'plugin',
        sourcePath: '/pilot/source/hooks/codex.json',
        startedAt: 1728000000,
        status,
    };
}
function fixtureRequest(overrides = {}) {
    return {
        method: 'POST',
        path: '/v1/responses',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
            JSON.stringify({
                model: FIXTURE_MODEL,
                instructions: 'Synthetic instructions',
                input: [
                    {
                        type: 'message',
                        role: 'user',
                        content: [{ type: 'input_text', text: context }],
                    },
                ],
                tools: [],
                tool_choice: 'auto',
                parallel_tool_calls: false,
                reasoning: null,
                store: false,
                stream: true,
                include: [],
                ...overrides,
            }),
        ),
    };
}
function fakeRun(selected = input(), mutate = () => {}) {
    const state = {
        calls: [],
        closed: 0,
        fixtureClosed: 0,
        starts: 0,
        artifacts: 0,
        fingerprints: [],
        trust: null,
        stdout: [],
    };
    const queue = [];
    let wake;
    let handler;
    let hooksCalls = 0;
    let closed = false;
    const emit = (value) => {
        state.stdout.push(Buffer.from(JSON.stringify(value) + '\n'));
        queue.push({
            kind: 'bytes',
            stream: 'stdout',
            bytes: Buffer.from(JSON.stringify(value) + '\n'),
        });
        wake?.();
        wake = undefined;
    };
    const notify = (method, params) => emit({ method, params });
    const reply = (request, result) => {
        mutate(request, result, state, emit);
        emit({ id: request.id, result });
    };
    const process = {
        async write(bytes) {
            const request = CodexJsonlCodec.json(bytes);
            state.calls.push(request);
            if (request.method === 'initialized') return;
            switch (request.method) {
                case 'initialize':
                    reply(request, {
                        codexHome: `${syntheticContainerHome}/.codex`,
                        platformFamily: 'unix',
                        platformOs: 'linux',
                        userAgent: 'codex/0.160.0',
                    });
                    break;
                case 'account/read':
                    reply(request, { account: null, requiresOpenaiAuth: false });
                    break;
                case 'skills/list':
                    reply(request, {
                        data: [
                            {
                                cwd: '/pilot/consumer',
                                errors: [],
                                skills: selected.skills.map((skill) => ({
                                    name: `i9-skills:${skill.name}`,
                                    description: skill.description,
                                    path: `/pilot/source/.agents/skills/${skill.name}/SKILL.md`,
                                    enabled: true,
                                    scope: 'user',
                                    pluginId: selected.pluginId,
                                })),
                            },
                        ],
                    });
                    break;
                case 'hooks/list':
                    reply(request, {
                        data: [
                            {
                                cwd: '/pilot/consumer',
                                errors: [],
                                warnings: [],
                                hooks: [hook(hooksCalls++ > 0)],
                            },
                        ],
                    });
                    break;
                case 'config/batchWrite':
                    state.trust = request.params;
                    reply(request, {
                        filePath: `${syntheticContainerHome}/.codex/config.toml`,
                        status: 'ok',
                        version: 'synthetic-version',
                    });
                    break;
                case 'thread/start':
                    reply(request, {
                        approvalPolicy: 'never',
                        approvalsReviewer: 'user',
                        cwd: '/pilot/consumer',
                        model: FIXTURE_MODEL,
                        modelProvider: 'native_pilot',
                        sandbox: { type: 'readOnly', networkAccess: false },
                        thread: {
                            id: THREAD,
                            sessionId: THREAD,
                            cliVersion: '0.160.0',
                            createdAt: 1728000000,
                            updatedAt: 1728000000,
                            cwd: '/pilot/consumer',
                            ephemeral: true,
                            modelProvider: 'native_pilot',
                            preview: '',
                            projectId: null,
                            source: 'appServer',
                            status: { type: 'idle' },
                            turns: [],
                        },
                    });
                    break;
                case 'mcpServerStatus/list':
                    reply(request, {
                        data: [
                            {
                                name: 'synthetic-native-plugin-server',
                                pluginId: selected.pluginId,
                                runtimeStatus: 'connected',
                                authStatus: 'unsupported',
                                resources: [],
                                resourceTemplates: [],
                                tools: {
                                    skill_catalog_search: {
                                        name: 'skill_catalog_search',
                                        inputSchema: { type: 'object' },
                                    },
                                    skill_resource_read: {
                                        name: 'skill_resource_read',
                                        inputSchema: { type: 'object' },
                                    },
                                },
                            },
                        ],
                        nextCursor: null,
                    });
                    break;
                case 'mcpServer/tool/call': {
                    const args = request.params.arguments;
                    const value =
                        request.params.tool === 'skill_catalog_search'
                            ? {
                                  provenance: { collection: 'synthetic' },
                                  query: '',
                                  limit: 50,
                                  offset: args.offset,
                                  total: selected.skills.length,
                                  next_offset:
                                      args.offset + 50 < selected.skills.length
                                          ? args.offset + 50
                                          : null,
                                  skills: selected.skills
                                      .slice(args.offset, args.offset + 50)
                                      .map((skill) => ({
                                          name: skill.name,
                                          path: `.agents/skills/${skill.name}`,
                                          description: skill.description,
                                          tags: skill.tags,
                                      })),
                              }
                            : {
                                  provenance: { collection: 'synthetic' },
                                  skill: selected.resource.skill,
                                  resource: selected.resource.resource,
                                  media_type: 'text/markdown',
                                  byte_length: Buffer.byteLength(content),
                                  content_sha256: sha(content),
                                  content,
                              };
                    reply(request, {
                        content: [{ type: 'text', text: JSON.stringify(value) }],
                        structuredContent: value,
                        isError: false,
                    });
                    break;
                }
                case 'turn/start': {
                    reply(request, {
                        turn: { id: TURN, items: [], status: 'inProgress' },
                    });
                    notify('hook/started', {
                        threadId: THREAD,
                        turnId: null,
                        run: hookRun('running'),
                    });
                    const response = handler(fixtureRequest());
                    state.response = response;
                    notify('hook/completed', {
                        threadId: THREAD,
                        turnId: null,
                        run: hookRun('completed'),
                    });
                    notify('item/completed', {
                        completedAtMs: 1728000000000,
                        threadId: THREAD,
                        turnId: TURN,
                        item: {
                            id: 'synthetic-agent-item',
                            type: 'agentMessage',
                            text: FIXTURE_REPLY,
                        },
                    });
                    notify('turn/completed', {
                        threadId: THREAD,
                        turn: { id: TURN, items: [], status: 'completed' },
                    });
                    break;
                }
                default:
                    throw new Error('Unexpected fake request');
            }
        },
        async *events() {
            for (;;) {
                while (queue.length) {
                    const event = queue.shift();
                    yield event;
                    if (event.kind === 'exit') return;
                }
                if (closed) return;
                await new Promise((resolve) => {
                    wake = resolve;
                });
            }
        },
        async terminate() {
            state.closed++;
            closed = true;
            queue.push({
                kind: 'exit',
                exitCode: 0,
                signal: null,
                terminationRequested: true,
                timedOut: false,
                outputTruncated: false,
            });
            wake?.();
            return { exited: true };
        },
    };
    const confinement = {
        evidenceKind: 'synthetic_fake',
        async start(argv) {
            state.starts++;
            state.argv = argv;
            return process;
        },
        fixture: {
            async start(selectedHandler) {
                handler = selectedHandler;
                return {
                    baseUrl: 'http://127.0.0.1:49152/v1',
                    async close() {
                        state.fixtureClosed++;
                    },
                };
            },
        },
        async fingerprint(path) {
            state.fingerprints.push(path);
            return structuredClone(
                selected.skills.find((skill) => path.endsWith('/' + skill.name)).files,
            );
        },
        async artifact() {
            state.artifacts++;
            return structuredClone(selected.artifactInventory);
        },
    };
    return { state, confinement, process };
}

export { input, fakeRun, fixtureRequest, validator };
