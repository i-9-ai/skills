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
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexJsonlCodec } from '../../../src/transport/CodexJsonlCodec.ts';
import { NativeCodexSchemaRepository } from '../../../src/repository/NativeCodexSchemaRepository.ts';
import { NativeCodexProtocolValidator } from '../../../src/validator/NativeCodexProtocolValidator.ts';
import { CodexRpcSession } from '../../../src/transport/CodexRpcSession.ts';
import {
    LoopbackResponsesFixture,
    FIXTURE_REPLY,
    FIXTURE_MODEL,
} from '../../../src/transport/LoopbackResponsesFixture.ts';
import { NativeCodexObservationService } from '../../../src/service/NativeCodexObservationService.ts';
import { NativeCodexObservationError } from '../../../src/validator/NativeCodexObservationError.ts';
import { NativeCodexObserverDispatcher } from '../../../src/service/NativeCodexObserverDispatcher.ts';
import { NativeCodexObservationRepository } from '../../../src/repository/NativeCodexObservationRepository.ts';

const root = fileURLToPath(new URL('../../../assets/native-pilot/codex/', import.meta.url));
// Ordinary account of the disposable Linux image, never the test runner's home.
const imageHome = posix.join('/', 'home', 'node');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const validator = new NativeCodexProtocolValidator(
    new NativeCodexSchemaRepository(join(root, 'schemas')),
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
        imageHome,
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
    };
    const queue = [];
    let wake;
    let handler;
    let hooksCalls = 0;
    let closed = false;
    const emit = (value) => {
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
                        codexHome: `${imageHome}/.codex`,
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
                        filePath: `${imageHome}/.codex/config.toml`,
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

test('codec preserves split UTF-8 and rejects duplicate keys, invalid Unicode and diagnostics', () => {
    const codec = new CodexJsonlCodec();
    const bytes = Buffer.from('{"text":"café"}\n');
    const split = bytes.indexOf(0xc3) + 1;
    assert.deepEqual(codec.push(bytes.subarray(0, split)), []);
    assert.equal(codec.push(bytes.subarray(split))[0].text, 'café');
    codec.finish();
    for (const text of [
        '{"x":1,"x":2}',
        '{"x":{"a":1,"a":2}}',
        '{"x":"\\ud800"}',
        'INFO native startup',
        '{"x":1}garbage',
        '{"x":1e999}',
    ])
        assert.throws(() => CodexJsonlCodec.json(Buffer.from(text)));
    assert.throws(() => CodexJsonlCodec.json(Uint8Array.of(0xff)));
    const incomplete = new CodexJsonlCodec();
    incomplete.push(Buffer.from('{"x":1}'));
    assert.throws(() => incomplete.finish(), /truncated/);
    assert.throws(
        () => new CodexJsonlCodec().push(Buffer.alloc(CodexJsonlCodec.frameBytes + 1, 32)),
        /bound/,
    );
});
test('pinned schema data rejects digest drift and unknown schema names', () => {
    assert.throws(() => validator.schema('v2/Unknown.json', {}), /unknown_schema/);
    const temporary = mkdtempSync(join(realpathSync(tmpdir()), 'i9-codex-schema-test-'));
    try {
        cpSync(join(root, 'schemas'), join(temporary, 'schemas'), {
            recursive: true,
        });
        chmodSync(join(temporary, 'schemas/v1/InitializeResponse.json'), 0o600);
        writeFileSync(join(temporary, 'schemas/v1/InitializeResponse.json'), '{}');
        assert.throws(
            () => new NativeCodexSchemaRepository(join(temporary, 'schemas')),
            /schema_digest/,
        );
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
test('closed variant validation rejects another hook variant fields and unknown diagnostics', () => {
    const value = {
        data: [{ cwd: '/pilot/consumer', errors: [], warnings: [], hooks: [hook()] }],
    };
    validator.response('hooks/list', value);
    value.data[0].hooks[0].server = 'hidden';
    assert.throws(() => validator.response('hooks/list', value), /schema_mismatch/);
    assert.throws(
        () => validator.notification('warning', { message: 'ignored' }),
        /unexpected_notification/,
    );
    assert.throws(
        () =>
            validator.response('initialize', {
                codexHome: `${imageHome}/.codex`,
                platformFamily: 'unix',
                platformOs: 'linux',
                userAgent: '0.160.0',
                extra: true,
            }),
        /schema_mismatch/,
    );
});
test('complete fake flow pages all 51 packages, checks bytes twice and writes exact trust state', async () => {
    const selected = input(51),
        fake = fakeRun(selected);
    const report = await new NativeCodexObservationService(validator).observe(
        selected,
        fake.confinement,
    );
    assert.equal(report.evidence_kind, 'synthetic_fake');
    assert.equal(report.loaded_skills.length, 51);
    assert.equal(report.mcp.catalog_count, 51);
    assert.equal(report.mcp.resource_rpc, 'unsupported');
    assert.equal(fake.state.fingerprints.length, 102);
    assert.equal(fake.state.artifacts, 2);
    assert.equal(fake.state.closed, 1);
    assert.equal(fake.state.fixtureClosed, 1);
    assert.deepEqual(
        fake.state.calls
            .filter((call) => call.params?.tool === 'skill_catalog_search')
            .map((call) => call.params.arguments.offset),
        [0, 50],
    );
    assert.equal(
        fake.state.calls.filter((call) => call.params?.tool === 'skill_resource_read').length,
        1,
    );
    assert.equal(fake.state.trust.edits[0].keyPath, 'hooks.state');
    assert.equal(
        fake.state.trust.edits[0].value['synthetic-exact-hook'].trusted_hash,
        hook().currentHash,
    );
    assert.equal(fake.state.trust.filePath, `${imageHome}/.codex/config.toml`);
    assert.equal(fake.state.trust.reloadUserConfig, true);
    assert.equal(fake.state.response.status, 200);
    assert.equal(report.session_start.fixture.context_present, true);
    assert.equal(report.limits.provider_inference, 'not_performed');
    assert.ok(fake.state.argv.includes('--strict-config'));
    assert.ok(fake.state.argv.includes('model_providers.native_pilot.request_max_retries=0'));
    assert.ok(
        fake.state.argv.every((value) => !value.includes('CODEX_HOME') && !value.includes('HOME=')),
    );
});
for (const [name, mutate, reason] of [
    [
        'version',
        (request, result) => {
            if (request.method === 'initialize') result.userAgent = '0.159.0';
        },
        'native_identity',
    ],
    [
        'authentication',
        (request, result) => {
            if (request.method === 'account/read') result.requiresOpenaiAuth = true;
        },
        'native_auth_state',
    ],
    [
        'missing loaded package',
        (request, result) => {
            if (request.method === 'skills/list') result.data[0].skills = [];
        },
        'native_skill_inventory',
    ],
    [
        'wrong native path',
        (request, result) => {
            if (request.method === 'skills/list')
                result.data[0].skills[0].path = '/outside/SKILL.md';
        },
        'native_skill_path',
    ],
    [
        'hook warning',
        (request, result) => {
            if (request.method === 'hooks/list') result.data[0].warnings = ['synthetic warning'];
        },
        'native_hook_diagnostic',
    ],
    [
        'hook command',
        (request, result) => {
            if (request.method === 'hooks/list')
                result.data[0].hooks[0].command = 'different command';
        },
        'native_hook_identity',
    ],
    [
        'wrong config target',
        (request, result) => {
            if (request.method === 'config/batchWrite')
                result.filePath = `${imageHome}/.codex/other.toml`;
        },
        'native_hook_trust_write',
    ],
    [
        'failed MCP connection',
        (request, result) => {
            if (request.method === 'mcpServerStatus/list') result.data[0].runtimeStatus = 'failed';
        },
        'native_mcp_status',
    ],
    [
        'incomplete catalog',
        (request, result) => {
            if (
                request.method === 'mcpServer/tool/call' &&
                request.params.tool === 'skill_catalog_search'
            )
                result.structuredContent.total = 0;
        },
        'native_mcp_tool_content',
    ],
    [
        'resource hash',
        (request, result) => {
            if (
                request.method === 'mcpServer/tool/call' &&
                request.params.tool === 'skill_resource_read'
            ) {
                result.structuredContent.content_sha256 = '0'.repeat(64);
                result.content[0].text = JSON.stringify(result.structuredContent);
            }
        },
        'native_mcp_resource_bytes',
    ],
])
    test(`fake flow rejects ${name} and cleans both transports`, async () => {
        const selected = input(),
            fake = fakeRun(selected, mutate);
        await assert.rejects(
            () => new NativeCodexObservationService(validator).observe(selected, fake.confinement),
            new RegExp(reason),
        );
        assert.equal(fake.state.closed, 1);
        assert.equal(fake.state.fixtureClosed, 1);
    });
test('changed final artifact bytes cannot produce observed result', async () => {
    const selected = input(),
        fake = fakeRun(selected);
    const original = fake.confinement.artifact;
    fake.confinement.artifact = async () => {
        const inventory = await original();
        if (fake.state.artifacts === 2) {
            inventory.entries.find((entry) => entry.kind === 'file').sha256 = '0'.repeat(64);
            inventory.tree_sha256 = sha(JSON.stringify(inventory.entries));
        }
        return inventory;
    };
    await assert.rejects(
        () => new NativeCodexObservationService(validator).observe(selected, fake.confinement),
        /native_artifact_bytes/,
    );
    assert.equal(fake.state.closed, 1);
    assert.equal(fake.state.fixtureClosed, 1);
});
test('invalid internal input creates no process or fixture effects', async () => {
    const selected = input(),
        fake = fakeRun(selected);
    let fixtureCalls = 0;
    fake.confinement.fixture.start = async () => {
        fixtureCalls++;
        throw new Error('must not start');
    };
    selected.assurance = 'pass';
    await assert.rejects(
        () => new NativeCodexObservationService(validator).observe(selected, fake.confinement),
        /observer_input/,
    );
    assert.equal(fake.state.starts, 0);
    assert.equal(fixtureCalls, 0);
});
test('fixture rejects credentials, forwarding, extra requests and tool call input without inference', () => {
    for (const request of [
        {
            ...fixtureRequest(),
            headers: { authorization: 'synthetic-not-a-secret' },
        },
        { ...fixtureRequest(), path: 'http://outside/responses' },
        fixtureRequest({
            input: [{ type: 'function_call', name: 'shell', arguments: '{}' }],
        }),
        fixtureRequest({ future_field: true }),
    ]) {
        const fixture = new LoopbackResponsesFixture();
        assert.equal(fixture.handle(request).status, 400);
        assert.throws(() => fixture.observation(context));
    }
    const fixture = new LoopbackResponsesFixture();
    assert.equal(fixture.handle(fixtureRequest()).status, 200);
    assert.equal(fixture.observation(context).requests, 1);
    assert.equal(fixture.handle(fixtureRequest()).status, 400);
    assert.throws(() => fixture.observation(context));
    const absent = new LoopbackResponsesFixture();
    absent.handle(
        fixtureRequest({
            input: [
                {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'different context' }],
                },
            ],
        }),
    );
    assert.throws(() => absent.observation(context), /context_not_observed/);
});
test('JSONL session rejects unsolicited approvals and diagnostic stderr', async () => {
    for (const event of [
        {
            kind: 'bytes',
            stream: 'stdout',
            bytes: Buffer.from(
                '{"id":1,"method":"item/commandExecution/requestApproval","params":{}}\n',
            ),
        },
        { kind: 'bytes', stream: 'stderr', bytes: Buffer.from('diagnostic') },
    ]) {
        let exit;
        const process = {
            async write() {},
            async *events() {
                yield event;
                await new Promise((resolve) => {
                    exit = resolve;
                });
                yield {
                    kind: 'exit',
                    exitCode: null,
                    signal: 'SIGTERM',
                    timedOut: false,
                    outputTruncated: false,
                };
            },
            async terminate() {
                exit?.();
                return { exited: true };
            },
        };
        const session = new CodexRpcSession(process, validator, 20);
        await assert.rejects(() =>
            session.request('initialize', {
                clientInfo: { name: 'test', version: '1' },
            }),
        );
        await assert.rejects(() => session.close());
    }
});
test('fixed dispatcher rejects arbitrary roots, duplicate flags and unrelated phases', () => {
    const dispatcher = new NativeCodexObserverDispatcher();
    const argv = [
        '--contract',
        '/pilot/contract.json',
        '--root',
        '/pilot',
        '--run-id',
        THREAD,
        '--host',
        'codex',
        '--repetition',
        '1',
        '--phase',
        'observe-a',
        '--pin',
        'a',
    ];
    const selection = dispatcher.selection(argv);
    assert.equal(selection.phase, 'observe-a');
    assert.throws(
        () =>
            dispatcher.selection(
                argv.map((value) => (value === '/pilot' ? '/private/tmp/elsewhere' : value)),
            ),
        /dispatcher_selection/,
    );
    assert.throws(
        () => dispatcher.selection([...argv, '--phase', 'observe-a']),
        /dispatcher_selection/,
    );
    const selected = input();
    assert.throws(
        () =>
            dispatcher.project(
                { ...selection, phase: 'baseline' },
                {},
                selected.artifactInventory,
                {},
                {},
            ),
        /unsupported_phase/,
    );
});

test('owned observation files reject aliases and retain exact bytes without overwrite', () => {
    const temporary = mkdtempSync(join(realpathSync(tmpdir()), 'i9-codex-retain-test-'));
    try {
        const repository = new NativeCodexObservationRepository();
        const input = join(temporary, 'input.json');
        writeFileSync(input, '{"synthetic":true}');
        assert.equal(repository.json(input).synthetic, true);
        const link = join(temporary, 'linked.json');
        symlinkSync('input.json', link);
        assert.throws(() => repository.json(link), /input_path/);
        const alias = join(temporary, 'alias.json');
        linkSync(input, alias);
        assert.throws(() => repository.json(input), /input_file/);
        const output = repository.createOutput(temporary, 'owned-phase');
        const bytes = Buffer.from('synthetic inert evidence\n');
        const retained = repository.retain(output, 'stdout.jsonl', bytes);
        assert.equal(retained.sha256, sha(bytes));
        assert.equal(retained.bytes, bytes.length);
        assert.ok(readFileSync(join(output, 'stdout.jsonl')).equals(bytes));
        assert.throws(() => repository.retain(output, 'stdout.jsonl', Buffer.from('replacement')));
        assert.ok(readFileSync(join(output, 'stdout.jsonl')).equals(bytes));
        assert.throws(() => repository.createOutput(temporary, 'owned-phase'));
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

for (const namespace of ['', 'another-plugin:']) {
    test(
        'rejects a bare or foreign namespace instead of renaming native claims: ' + namespace,
        async () => {
            const selected = input();
            const fake = fakeRun(selected, (request, result) => {
                if (request.method === 'skills/list')
                    result.data[0].skills[0].name = namespace + selected.skills[0].name;
            });
            await assert.rejects(
                new NativeCodexObservationService(validator).observe(selected, fake.confinement),
                /native_skill_metadata/,
            );
            assert.equal(
                fake.state.calls.some((x) => x.method === 'hooks/list'),
                false,
            );
        },
    );
}
test('retains first metadata failure separately from cleanup failure', async () => {
    const selected = input();
    const fake = fakeRun(selected, (request, result) => {
        if (request.method === 'skills/list')
            result.data[0].skills[0].name = 'wrong:skill-authoring';
    });
    const fixture = fake.confinement.fixture.start;
    fake.confinement.fixture.start = async (...args) => {
        const host = await fixture(...args);
        host.close = async () => {
            throw new Error('cleanup_synthetic');
        };
        return host;
    };
    await assert.rejects(
        new NativeCodexObservationService(validator).observe(selected, fake.confinement),
        (error) =>
            error instanceof NativeCodexObservationError &&
            error.message === 'native_skill_metadata' &&
            error.cleanup_failure === 'cleanup_synthetic',
    );
    assert.equal(fake.state.closed, 1);
});
test('cleanup failure still prevents an otherwise observed result', async () => {
    const selected = input();
    const fake = fakeRun(selected);
    const fixture = fake.confinement.fixture.start;
    fake.confinement.fixture.start = async (...args) => {
        const host = await fixture(...args);
        host.close = async () => {
            throw new Error('cleanup_synthetic');
        };
        return host;
    };
    await assert.rejects(
        new NativeCodexObservationService(validator).observe(selected, fake.confinement),
        /cleanup_synthetic/,
    );
});
