// SPDX-License-Identifier: Apache-2.0
import { NativeCodexObservationError } from '../validator/NativeCodexObservationError.ts';
import { createHash } from 'node:crypto';
import { dirname, posix } from 'node:path';
import { NativeCodexProtocolValidator } from '../validator/NativeCodexProtocolValidator.ts';
import { CodexRpcSession } from '../transport/CodexRpcSession.ts';
import type { StreamingProcess } from '../transport/CodexRpcSession.ts';
import {
    LoopbackResponsesFixture,
    FIXTURE_MODEL,
    FIXTURE_REPLY,
} from '../transport/LoopbackResponsesFixture.ts';
import type { FixtureHost } from '../transport/LoopbackResponsesFixture.ts';
import { CodexJsonlCodec } from '../transport/CodexJsonlCodec.ts';
import { NativeCodexConfiguration } from '../config/NativeCodexConfiguration.ts';
import type { NativePilotStateSnapshot } from '../repository/NativePilotStateSnapshotRepository.ts';

export type FileIdentity = { path: string; sha256: string; bytes: number };
export type SkillIdentity = {
    name: string;
    description: string;
    tags: string[];
    files: FileIdentity[];
};
export type HookIdentity = {
    eventName: string;
    matcher: string | null;
    command: string;
    timeoutSec: number;
    additionalContextLimit: number | null;
    sourceRelativePath: string;
};
export type ArtifactEntry = {
    path: string;
    kind: 'file' | 'directory' | 'symlink';
    bytes: number;
    sha256: string | null;
    executable: boolean;
    target: string | null;
};
export type ArtifactInventory = {
    tree_sha256: string;
    bytes: number;
    entries: ArtifactEntry[];
};
export type ObserverInput = {
    schema: 1;
    phase: 'install' | 'update' | 'rollback';
    imageHome: string;
    pluginId: 'i9-skills@i9-skills';
    skills: SkillIdentity[];
    hooks: HookIdentity[];
    artifactInventory: ArtifactInventory;
    resource: { skill: string; resource: string; sha256: string; bytes: number };
};
export type ObserverConfinement = {
    start(argv: readonly string[]): Promise<StreamingProcess>;
    fixture: FixtureHost;
    fingerprint(path: string): Promise<FileIdentity[]>;
    artifact(path: string): Promise<ArtifactInventory>;
    evidenceKind: 'synthetic_fake' | 'confined_native';
    captureState?(label: 'mcp-before' | 'mcp-after'): Promise<{
        snapshot: NativePilotStateSnapshot;
        artifacts: Array<{ role: string; path: string; bytes: number; sha256: string }>;
    }>;
};
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const path = (value: any): string => {
    if (
        typeof value !== 'string' ||
        value.length > 4096 ||
        value.includes('\0') ||
        !value.startsWith('/') ||
        posix.normalize(value) !== value ||
        value.endsWith('/')
    )
        throw new Error('native_path');
    return value;
};
const closed = (value: any, fields: string[]) => {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !fields.includes(key)) ||
        fields.some((key) => !Object.hasOwn(value, key))
    )
        throw new Error('observer_input');
};

/** Measures one fixed installed native package state; makes no install/update/readiness claim. */
export class NativeCodexObservationService {
    private readonly validator: NativeCodexProtocolValidator;
    private readonly readinessClock: {
        now(): number;
        wait(milliseconds: number): Promise<void>;
    };
    constructor(
        validator: NativeCodexProtocolValidator,
        readinessClock = {
            now: () => performance.now(),
            wait: (milliseconds: number) =>
                new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
        },
    ) {
        this.validator = validator;
        this.readinessClock = readinessClock;
    }

    async observe(input: ObserverInput, confinement: ObserverConfinement): Promise<unknown> {
        this.input(input);
        const fixture = new LoopbackResponsesFixture();
        const host = await confinement.fixture.start(fixture.handle, {
            address: '127.0.0.1',
            requests: 1,
            bodyBytes: 1_048_576,
            timeoutMs: 10_000,
        });
        let session: CodexRpcSession | undefined;
        let primaryFailure: unknown;
        let failed = false;
        try {
            if (
                !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/v1$/.test(host.baseUrl) ||
                new URL(host.baseUrl).port === '' ||
                Number(new URL(host.baseUrl).port) > 65535
            )
                throw new Error('fixture_endpoint');
            const argv = NativeCodexConfiguration.argv(host.baseUrl);
            const nativeDeadline = this.readinessClock.now() + 40_000;
            const process = await confinement.start(argv);
            session = new CodexRpcSession(process, this.validator);
            if (confinement.evidenceKind === 'confined_native' && !process.identity)
                throw new Error('native_process_identity_unavailable');
            const initialized = await session.request('initialize', {
                clientInfo: {
                    name: 'i9_native_pilot',
                    title: 'Disposable native pilot',
                    version: '1.0.0',
                },
                capabilities: {
                    experimentalApi: true,
                    requestAttestation: false,
                    explicitGatewayOauth: true,
                },
            });
            if (
                initialized.codexHome !== `${input.imageHome}/.codex` ||
                initialized.platformFamily !== 'unix' ||
                initialized.platformOs !== 'linux' ||
                !/(?:^|[^\d])0\.160\.0(?:[^\d]|$)/.test(initialized.userAgent)
            )
                throw new Error('native_identity');
            await session.initialized();
            const account = await session.request('account/read', {
                refreshToken: false,
            });
            if (account.account !== null || account.requiresOpenaiAuth !== false)
                throw new Error('native_auth_state');
            const listed = await session.request('skills/list', {
                cwds: ['/pilot/consumer'],
                forceReload: true,
            });
            if (
                listed.data.length !== 1 ||
                listed.data[0].cwd !== '/pilot/consumer' ||
                listed.data[0].errors.length !== 0
            )
                throw new Error('native_skill_diagnostic');
            const skills = listed.data[0].skills.filter(
                (skill: any) => skill.pluginId === input.pluginId,
            );
            if (
                skills.length !== input.skills.length ||
                new Set(skills.map((skill: any) => skill.name)).size !== skills.length
            )
                throw new Error('native_skill_inventory');
            let pluginRoot: string | undefined;
            const loaded: {
                name: string;
                entrypoint: string;
                package_sha256: string;
                files: number;
                bytes: number;
            }[] = [];
            for (const expected of input.skills) {
                // The pinned native host namespaces plugin skills; package paths remain bare.
                const actual = skills.find(
                    (skill: any) => skill.name === `i9-skills:${expected.name}`,
                );
                if (!actual || !actual.enabled || actual.description !== expected.description)
                    throw new Error('native_skill_metadata');
                const entrypoint = path(actual.path);
                const suffix = `/.agents/skills/${expected.name}/SKILL.md`;
                if (!entrypoint.endsWith(suffix)) throw new Error('native_skill_path');
                const root = entrypoint.slice(0, -suffix.length);
                if (
                    !(
                        root === '/pilot/source' ||
                        root.startsWith(`${NativeCodexConfiguration.accountHome}/.codex/`)
                    ) ||
                    (pluginRoot !== undefined && pluginRoot !== root)
                )
                    throw new Error('native_plugin_root');
                pluginRoot = root;
                const files = await confinement.fingerprint(dirname(entrypoint));
                this.files(files, expected.files);
                loaded.push({
                    name: expected.name,
                    entrypoint,
                    package_sha256: digest(JSON.stringify(files)),
                    files: files.length,
                    bytes: files.reduce((n, file) => n + file.bytes, 0),
                });
            }
            if (!pluginRoot) throw new Error('native_plugin_root');
            const installedArtifact = await confinement.artifact(pluginRoot);
            const transformations = this.installedArtifact(
                installedArtifact,
                input.artifactInventory,
                pluginRoot,
            );
            const before = await session.request('hooks/list', {
                cwds: ['/pilot/consumer'],
            });
            const hooks = this.hooks(before, input, pluginRoot);
            const state = Object.fromEntries(
                hooks.map((hook: any) => [hook.key, { trusted_hash: hook.currentHash }]),
            );
            const trustPath = `${initialized.codexHome}/config.toml`;
            const written = await session.request('config/batchWrite', {
                edits: [{ keyPath: 'hooks.state', value: state, mergeStrategy: 'upsert' }],
                filePath: trustPath,
                expectedVersion: null,
                reloadUserConfig: true,
            });
            if (
                written.filePath !== trustPath ||
                written.status !== 'ok' ||
                written.overriddenMetadata
            )
                throw new Error('native_hook_trust_write');
            const trusted = this.hooks(
                await session.request('hooks/list', { cwds: ['/pilot/consumer'] }),
                input,
                pluginRoot,
            );
            for (const hook of trusted) {
                const prior = hooks.find((item: any) => item.key === hook.key);
                if (
                    !prior ||
                    prior.currentHash !== hook.currentHash ||
                    hook.trustStatus !== 'trusted'
                )
                    throw new Error('native_hook_trust_recheck');
            }
            const started = await session.request('thread/start', {
                cwd: '/pilot/consumer',
                model: FIXTURE_MODEL,
                modelProvider: 'native_pilot',
                ephemeral: true,
                approvalPolicy: 'never',
                approvalsReviewer: 'user',
                sandbox: 'read-only',
            });
            if (
                started.cwd !== '/pilot/consumer' ||
                started.model !== FIXTURE_MODEL ||
                started.modelProvider !== 'native_pilot' ||
                started.approvalPolicy !== 'never' ||
                started.sandbox.type !== 'readOnly' ||
                started.sandbox.networkAccess === true ||
                !started.thread.ephemeral ||
                started.thread.cwd !== '/pilot/consumer' ||
                started.thread.cliVersion !== '0.160.0'
            )
                throw new Error('native_thread_controls');
            const threadId = started.thread.id;
            if (!confinement.captureState && confinement.evidenceKind === 'confined_native')
                throw new Error('native_mcp_state_collector_unavailable');
            const mcpBefore = await confinement.captureState?.('mcp-before');
            const server = await this.mcp(session, threadId, input.pluginId, nativeDeadline);
            const catalog = await this.catalog(session, threadId, server.name, input);
            const resource = await this.tool(
                session,
                threadId,
                server.name,
                'skill_resource_read',
                { skill: input.resource.skill, resource: input.resource.resource },
            );
            if (
                resource.skill !== input.resource.skill ||
                resource.resource !== input.resource.resource ||
                resource.media_type !== 'text/markdown' ||
                resource.byte_length !== input.resource.bytes ||
                resource.content_sha256 !== input.resource.sha256 ||
                typeof resource.content !== 'string' ||
                Buffer.byteLength(resource.content) !== input.resource.bytes ||
                digest(resource.content) !== input.resource.sha256
            )
                throw new Error('native_mcp_resource_bytes');
            const mcpAfter = await confinement.captureState?.('mcp-after');
            const mcpState =
                mcpBefore &&
                mcpAfter &&
                mcpBefore.snapshot.status === 'captured' &&
                mcpAfter.snapshot.status === 'captured' &&
                mcpBefore.snapshot.exists === mcpAfter.snapshot.exists &&
                (['files', 'migrations', 'schema', 'tables', 'state_sha256'] as const).every(
                    (key) =>
                        JSON.stringify(mcpBefore.snapshot[key]) ===
                        JSON.stringify(mcpAfter.snapshot[key]),
                )
                    ? mcpBefore.snapshot.exists
                        ? 'existing_unchanged'
                        : 'absence_preserved'
                    : 'blocked';
            if (confinement.evidenceKind === 'confined_native' && mcpState !== 'existing_unchanged')
                throw new Error('native_mcp_state_changed_or_unsupported');
            const turn = await session.request('turn/start', {
                threadId,
                input: [
                    {
                        type: 'text',
                        text: 'Reply with NATIVE_PILOT_ACK. Do not call any tool.',
                        text_elements: [],
                    },
                ],
            });
            const completion = await session.wait(
                (n) =>
                    n.method === 'turn/completed' &&
                    n.params.threadId === threadId &&
                    n.params.turn.id === turn.turn.id,
            );
            if (completion.params.turn.status !== 'completed' || completion.params.turn.error)
                throw new Error('native_fixture_turn');
            const observed = session.observed();
            this.events(observed, threadId, turn.turn.id);
            const completed = observed.filter(
                (n) =>
                    n.method === 'hook/completed' &&
                    n.params.threadId === threadId &&
                    n.params.run.eventName === 'sessionStart',
            );
            if (completed.length !== 1) throw new Error('native_session_start_count');
            const hook = completed[0].params.run;
            const selectedHook = input.hooks.find((item) => item.eventName === 'sessionStart');
            if (
                !selectedHook ||
                hook.status !== 'completed' ||
                hook.source !== 'plugin' ||
                hook.handlerType !== 'command' ||
                hook.executionMode !== 'sync' ||
                hook.sourcePath !== `${pluginRoot}/${selectedHook.sourceRelativePath}` ||
                hook.scope !== 'thread'
            )
                throw new Error('native_session_start_result');
            const hookStart = observed.find(
                (n) =>
                    n.method === 'hook/started' &&
                    n.params.threadId === threadId &&
                    n.params.run.id === hook.id,
            );
            if (
                !hookStart ||
                hookStart.params.run.eventName !== 'sessionStart' ||
                hookStart.params.run.sourcePath !== hook.sourcePath
            )
                throw new Error('native_session_start_correlation');
            if (
                hook.entries.length === 0 ||
                hook.entries.some(
                    (entry: any) =>
                        entry.kind !== 'context' ||
                        !entry.text ||
                        Buffer.byteLength(entry.text) > 16_384,
                )
            )
                throw new Error('native_hook_output');
            const contexts = hook.entries.map((entry: any) => entry.text);
            const fixtureObservation = contexts.map((context: string) =>
                fixture.observation(context),
            );
            if (
                completion.params.turn.items.some(
                    (item: any) => !['userMessage', 'agentMessage'].includes(item.type),
                )
            )
                throw new Error('native_fixture_tool_execution');
            const messageMap = new Map<string, any>();
            for (const item of completion.params.turn.items)
                if (item.type === 'agentMessage') messageMap.set(item.id, item);
            for (const notification of observed)
                if (
                    notification.method === 'item/completed' &&
                    notification.params.item.type === 'agentMessage'
                )
                    messageMap.set(notification.params.item.id, notification.params.item);
            const messages = [...messageMap.values()];
            if (messages.length !== 1 || messages[0].text !== FIXTURE_REPLY)
                throw new Error('native_fixture_reply');
            for (const expected of input.skills) {
                const actual = loaded.find((skill) => skill.name === expected.name)!;
                this.files(
                    await confinement.fingerprint(dirname(actual.entrypoint)),
                    expected.files,
                );
            }
            this.artifact(await confinement.artifact(pluginRoot), installedArtifact);
            return {
                schema: 2,
                evidence_kind: confinement.evidenceKind,
                native_version: '0.160.0',
                source_commit: 'a956835d020762cb2b570053af06f643a11c0ecc',
                phase: input.phase,
                result: 'observed',
                codex_home: initialized.codexHome,
                plugin_root: pluginRoot,
                source_artifact_tree_sha256: input.artifactInventory.tree_sha256,
                installed_artifact_tree_sha256: installedArtifact.tree_sha256,
                installed_artifact_inventory: installedArtifact,
                transformations,
                process_identity: process.identity ?? null,
                read_only_mcp: {
                    branch: mcpState,
                    snapshots: [...(mcpBefore?.artifacts ?? []), ...(mcpAfter?.artifacts ?? [])],
                },
                retained_startup_notices: session.diagnostics(),
                loaded_skills: loaded,
                hook_trust: {
                    config_path: trustPath,
                    config_version: written.version,
                    hooks: trusted.map((item: any) => ({
                        key: item.key,
                        current_hash: item.currentHash,
                        event: item.eventName,
                        source_path: item.sourcePath,
                        trust: 'trusted',
                    })),
                },
                mcp: {
                    name: server.name,
                    plugin_id: server.pluginId,
                    status: server.runtimeStatus,
                    catalog_count: catalog,
                    resource_sha256: resource.content_sha256,
                    resource_rpc:
                        server.resources.length || server.resourceTemplates.length
                            ? 'advertised_not_measured'
                            : 'unsupported',
                    resource_tool: 'skill_resource_read',
                },
                session_start: {
                    thread_id: threadId,
                    turn_id: turn.turn.id,
                    hook_run_id: hook.id,
                    context_sha256: contexts.map(digest),
                    fixture: fixtureObservation[0],
                },
                limits: {
                    provider_inference: 'not_performed',
                    tool_execution: 'none_during_fixture_turn',
                    advertised_tools: fixtureObservation[0].advertised_tools,
                    binary_authenticity: 'not_attested',
                    installation_lifecycle: 'controller_owned',
                },
            };
        } catch (error) {
            failed = true;
            primaryFailure = error;
            throw error;
        } finally {
            let cleanup: unknown;
            try {
                await session?.close();
            } catch (error) {
                cleanup = error;
            }
            try {
                await host.close();
            } catch (error) {
                cleanup ??= error;
            }
            if (cleanup && failed) throw new NativeCodexObservationError(primaryFailure, cleanup);
            if (cleanup) throw cleanup;
        }
    }

    private input(input: ObserverInput): void {
        closed(input, [
            'schema',
            'phase',
            'imageHome',
            'pluginId',
            'skills',
            'hooks',
            'resource',
            'artifactInventory',
        ]);
        if (
            input.schema !== 1 ||
            !['install', 'update', 'rollback'].includes(input.phase) ||
            input.imageHome !== NativeCodexConfiguration.accountHome ||
            input.pluginId !== 'i9-skills@i9-skills' ||
            !Array.isArray(input.skills) ||
            input.skills.length < 1 ||
            input.skills.length > 256 ||
            new Set(input.skills.map((item) => item.name)).size !== input.skills.length ||
            !Array.isArray(input.hooks) ||
            input.hooks.length > 8 ||
            input.hooks.filter((item) => item.eventName === 'sessionStart').length !== 1
        )
            throw new Error('observer_input');
        for (const skill of input.skills) {
            closed(skill, ['name', 'description', 'tags', 'files']);
            if (
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) ||
                skill.name.length > 64 ||
                typeof skill.description !== 'string' ||
                skill.description.length > 4096 ||
                !Array.isArray(skill.tags) ||
                skill.tags.length > 32 ||
                skill.tags.some((tag) => typeof tag !== 'string' || tag.length > 100) ||
                !Array.isArray(skill.files) ||
                skill.files.length < 1 ||
                skill.files.length > 4096
            )
                throw new Error('observer_input');
            this.files(skill.files, skill.files);
        }
        this.artifact(input.artifactInventory, input.artifactInventory);
        for (const hook of input.hooks) {
            closed(hook, [
                'eventName',
                'matcher',
                'command',
                'timeoutSec',
                'additionalContextLimit',
                'sourceRelativePath',
            ]);
            if (
                !['sessionStart', 'preToolUse', 'postToolUse'].includes(hook.eventName) ||
                !(hook.matcher === null || typeof hook.matcher === 'string') ||
                typeof hook.command !== 'string' ||
                hook.command.length > 2048 ||
                !Number.isInteger(hook.timeoutSec) ||
                hook.timeoutSec < 1 ||
                hook.timeoutSec > 10 ||
                !(
                    hook.additionalContextLimit === null ||
                    (Number.isInteger(hook.additionalContextLimit) &&
                        hook.additionalContextLimit >= 0 &&
                        hook.additionalContextLimit <= 4096)
                ) ||
                hook.sourceRelativePath !== 'hooks/codex.json'
            )
                throw new Error('observer_input');
        }
        closed(input.resource, ['skill', 'resource', 'sha256', 'bytes']);
        const selected = input.skills
            .find((skill) => skill.name === input.resource.skill)
            ?.files.find((file) => file.path === input.resource.resource);
        if (
            !selected ||
            selected.sha256 !== input.resource.sha256 ||
            selected.bytes !== input.resource.bytes ||
            input.resource.bytes > 65_536 ||
            !(
                input.resource.resource === 'SKILL.md' ||
                /^references\/[^\0]+\.md$/.test(input.resource.resource)
            )
        )
            throw new Error('observer_resource');
    }
    private files(actual: FileIdentity[], expected: FileIdentity[]): void {
        if (!Array.isArray(actual) || actual.length !== expected.length)
            throw new Error('native_package_files');
        const canonical = (files: FileIdentity[]) =>
            files
                .map((file) => {
                    closed(file, ['path', 'sha256', 'bytes']);
                    if (
                        typeof file.path !== 'string' ||
                        file.path.length > 1024 ||
                        file.path.startsWith('/') ||
                        posix.normalize(file.path) !== file.path ||
                        file.path === '..' ||
                        file.path.startsWith('../') ||
                        file.path.includes('\0') ||
                        !/^[a-f0-9]{64}$/.test(file.sha256) ||
                        !Number.isSafeInteger(file.bytes) ||
                        file.bytes < 0 ||
                        file.bytes > 16_777_216
                    )
                        throw new Error('native_package_files');
                    return file;
                })
                .sort((a, b) => a.path.localeCompare(b.path, 'en'));
        if (
            new Set(actual.map((file) => file.path)).size !== actual.length ||
            actual.reduce((n, file) => n + file.bytes, 0) > 16_777_216 ||
            JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))
        )
            throw new Error('native_package_files');
    }
    private artifact(actual: ArtifactInventory, expected: ArtifactInventory): void {
        for (const inventory of [actual, expected]) {
            closed(inventory, ['tree_sha256', 'bytes', 'entries']);
            if (
                !/^[a-f0-9]{64}$/.test(inventory.tree_sha256) ||
                !Number.isSafeInteger(inventory.bytes) ||
                inventory.bytes < 0 ||
                inventory.bytes > 536_870_912 ||
                !Array.isArray(inventory.entries) ||
                inventory.entries.length > 10_000
            )
                throw new Error('native_artifact_inventory');
            for (const entry of inventory.entries) {
                closed(entry, ['path', 'kind', 'bytes', 'sha256', 'executable', 'target']);
                if (
                    typeof entry.path !== 'string' ||
                    entry.path.length > 1024 ||
                    entry.path.startsWith('/') ||
                    posix.normalize(entry.path) !== entry.path ||
                    entry.path === '..' ||
                    entry.path.startsWith('../') ||
                    entry.path.includes('\0') ||
                    !['file', 'directory', 'symlink'].includes(entry.kind) ||
                    !Number.isSafeInteger(entry.bytes) ||
                    entry.bytes < 0 ||
                    entry.bytes > 33_554_432 ||
                    typeof entry.executable !== 'boolean'
                )
                    throw new Error('native_artifact_inventory');
                if (
                    entry.kind === 'directory'
                        ? entry.sha256 !== null ||
                          entry.bytes !== 0 ||
                          entry.target !== null ||
                          entry.executable
                        : !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') ||
                          (entry.kind === 'file' && entry.target !== null) ||
                          (entry.kind === 'symlink' &&
                              (typeof entry.target !== 'string' ||
                                  entry.target.startsWith('/') ||
                                  entry.executable))
                )
                    throw new Error('native_artifact_inventory');
            }
            if (
                new Set(inventory.entries.map((entry) => entry.path)).size !==
                    inventory.entries.length ||
                digest(JSON.stringify(inventory.entries)) !== inventory.tree_sha256 ||
                inventory.entries
                    .filter((entry) => entry.kind === 'file')
                    .reduce((n, entry) => n + entry.bytes, 0) !== inventory.bytes
            )
                throw new Error('native_artifact_inventory');
        }
        if (JSON.stringify(actual) !== JSON.stringify(expected))
            throw new Error('native_artifact_bytes');
    }
    /** Native cache omission of repository-only aliases is explicit, never reconstructed as loaded bytes. */
    private installedArtifact(
        actual: ArtifactInventory,
        expected: ArtifactInventory,
        root: string,
    ) {
        this.artifact(actual, actual);
        this.artifact(expected, expected);
        if (root === '/pilot/source') {
            this.artifact(actual, expected);
            return [];
        }
        if (!/^\/home\/node\/\.codex\/plugins\/cache\//.test(root))
            throw new Error('native_plugin_root');
        const aliases: Record<string, string> = {
            '.claude/skills': '../.agents/skills',
            '.github/skills': '../.agents/skills',
            'CLAUDE.md': 'AGENTS.md',
            'GEMINI.md': 'AGENTS.md',
        };
        const present = new Map(actual.entries.map((entry) => [entry.path, entry]));
        const transformations: Array<{
            kind: 'omitted-repository-alias';
            path: string;
            target: string;
        }> = [];
        for (const entry of expected.entries) {
            const installed = present.get(entry.path);
            if (installed) {
                if (JSON.stringify(installed) !== JSON.stringify(entry))
                    throw new Error('native_artifact_bytes');
                present.delete(entry.path);
                continue;
            }
            if (
                entry.kind !== 'symlink' ||
                !Object.hasOwn(aliases, entry.path) ||
                entry.target !== aliases[entry.path] ||
                entry.bytes !== Buffer.byteLength(entry.target) ||
                entry.sha256 !== digest(entry.target)
            )
                throw new Error('native_artifact_bytes');
            transformations.push({
                kind: 'omitted-repository-alias',
                path: entry.path,
                target: entry.target,
            });
        }
        if (present.size || actual.bytes !== expected.bytes)
            throw new Error('native_artifact_bytes');
        return transformations;
    }
    private hooks(response: any, input: ObserverInput, root: string): any[] {
        if (
            response.data.length !== 1 ||
            response.data[0].cwd !== '/pilot/consumer' ||
            response.data[0].errors.length ||
            response.data[0].warnings.length
        )
            throw new Error('native_hook_diagnostic');
        const selected = response.data[0].hooks.filter(
            (hook: any) => hook.pluginId === input.pluginId,
        );
        if (
            selected.length !== input.hooks.length ||
            new Set(selected.map((hook: any) => hook.key)).size !== selected.length
        )
            throw new Error('native_hook_inventory');
        for (const expected of input.hooks) {
            const hook = selected.find(
                (item: any) =>
                    item.eventName === expected.eventName && item.matcher === expected.matcher,
            );
            if (
                !hook ||
                hook.source !== 'plugin' ||
                !hook.enabled ||
                hook.isManaged ||
                hook.handlerType !== 'command' ||
                hook.async === true ||
                hook.command !== expected.command ||
                hook.timeoutSec !== expected.timeoutSec ||
                (hook.additionalContextLimit ?? null) !== expected.additionalContextLimit ||
                hook.sourcePath !== `${root}/${expected.sourceRelativePath}` ||
                !hook.key ||
                !hook.currentHash ||
                hook.currentHash.length > 256 ||
                !['untrusted', 'trusted'].includes(hook.trustStatus)
            )
                throw new Error('native_hook_identity');
        }
        return selected;
    }
    private async mcp(
        session: CodexRpcSession,
        threadId: string,
        pluginId: string,
        deadline: number,
    ): Promise<any> {
        const budget = { queries: 0 };
        let name: string | undefined;
        for (;;) {
            const servers = await this.mcpInventory(session, threadId, deadline, budget);
            const selected = servers.filter((server) => server.pluginId === pluginId);
            if (selected.length !== 1) throw new Error('native_mcp_inventory');
            const server = selected[0];
            if (name !== undefined && server.name !== name)
                throw new Error('native_mcp_identity_changed');
            name = server.name;
            if (
                (server.toolsError !== undefined && server.toolsError !== null) ||
                (server.httpOrigin !== undefined && server.httpOrigin !== null) ||
                !['unknown', 'unsupported'].includes(server.authStatus)
            )
                throw new Error('native_mcp_status');
            if (server.runtimeStatus === 'connected') {
                if (!server.tools.skill_catalog_search || !server.tools.skill_resource_read)
                    throw new Error('native_mcp_status');
                return server;
            }
            if (server.runtimeStatus !== 'starting') throw new Error('native_mcp_status');
            // Seven earlier and at most eight later requests leave sixteen of the
            // existing sixty-four RPC slots reserved for the unchanged recipe.
            if (budget.queries >= 48) throw new Error('native_mcp_readiness_bound');
            const remaining = deadline - this.readinessClock.now();
            if (remaining <= 0) throw new Error('native_mcp_readiness_deadline');
            await this.readinessClock.wait(Math.min(100, remaining));
        }
    }
    private async mcpInventory(
        session: CodexRpcSession,
        threadId: string,
        deadline: number,
        budget: { queries: number },
    ): Promise<any[]> {
        let cursor: string | null = null;
        const seen = new Set<string>();
        const names = new Set<string>();
        const servers: any[] = [];
        for (let page = 0; page < 8; page++) {
            if (this.readinessClock.now() >= deadline)
                throw new Error('native_mcp_readiness_deadline');
            if (budget.queries++ >= 48) throw new Error('native_mcp_readiness_bound');
            const result = await session.request('mcpServerStatus/list', {
                threadId,
                limit: 100,
                cursor,
                detail: 'full',
            });
            if (this.readinessClock.now() >= deadline)
                throw new Error('native_mcp_readiness_deadline');
            for (const server of result.data) {
                if (names.has(server.name)) throw new Error('native_mcp_inventory');
                names.add(server.name);
            }
            servers.push(...result.data);
            if (servers.length > 256) throw new Error('native_mcp_bound');
            cursor = result.nextCursor ?? null;
            if (cursor === null) break;
            if (seen.has(cursor) || page === 7) throw new Error('native_mcp_paging');
            seen.add(cursor);
        }
        return servers;
    }
    private async tool(
        session: CodexRpcSession,
        threadId: string,
        server: string,
        tool: string,
        args: unknown,
    ): Promise<any> {
        const response = await session.request('mcpServer/tool/call', {
            threadId,
            server,
            tool,
            arguments: args,
        });
        if (
            response.isError === true ||
            !response.structuredContent ||
            response.content.length !== 1 ||
            response.content[0].type !== 'text' ||
            typeof response.content[0].text !== 'string'
        )
            throw new Error('native_mcp_tool_error');
        if (
            JSON.stringify(CodexJsonlCodec.json(Buffer.from(response.content[0].text))) !==
            JSON.stringify(response.structuredContent)
        )
            throw new Error('native_mcp_tool_content');
        return response.structuredContent;
    }
    private async catalog(
        session: CodexRpcSession,
        threadId: string,
        server: string,
        input: ObserverInput,
    ): Promise<number> {
        let offset = 0;
        const rows: any[] = [];
        for (let page = 0; page < 6; page++) {
            const result = await this.tool(session, threadId, server, 'skill_catalog_search', {
                query: '',
                limit: 50,
                offset,
            });
            if (
                result.query !== '' ||
                result.offset !== offset ||
                result.limit !== 50 ||
                result.total !== input.skills.length ||
                !Array.isArray(result.skills) ||
                result.skills.length > 50
            )
                throw new Error('native_catalog_page');
            rows.push(...result.skills);
            if (result.next_offset === null) break;
            if (
                result.next_offset !== offset + result.skills.length ||
                result.next_offset <= offset ||
                page === 5
            )
                throw new Error('native_catalog_paging');
            offset = result.next_offset;
        }
        if (
            rows.length !== input.skills.length ||
            new Set(rows.map((row) => row.name)).size !== rows.length
        )
            throw new Error('native_catalog_inventory');
        for (const expected of input.skills) {
            const row = rows.find((row) => row.name === expected.name);
            if (
                !row ||
                row.path !== `.agents/skills/${expected.name}` ||
                row.description !== expected.description ||
                JSON.stringify(row.tags) !== JSON.stringify(expected.tags)
            )
                throw new Error('native_catalog_metadata');
        }
        return rows.length;
    }
    private events(
        notifications: readonly { method: string; params: any }[],
        threadId: string,
        turnId: string,
    ): void {
        for (const notification of notifications) {
            const p = notification.params;
            if (p.threadId !== undefined && p.threadId !== null && p.threadId !== threadId)
                throw new Error('native_notification_thread');
            if (p.turnId !== undefined && p.turnId !== null && p.turnId !== turnId)
                throw new Error('native_notification_turn');
            if (notification.method === 'account/updated' && p.authMode !== null)
                throw new Error('native_auth_change');
            if (
                notification.method === 'mcpServer/startupStatus/updated' &&
                (p.error || p.failureReason || !['starting', 'ready'].includes(p.status))
            )
                throw new Error('native_mcp_diagnostic');
            if (
                notification.method.startsWith('item/') &&
                p.item &&
                !['userMessage', 'agentMessage'].includes(p.item.type)
            )
                throw new Error('native_fixture_tool_execution');
            if (notification.method.startsWith('hook/') && p.run.eventName !== 'sessionStart')
                throw new Error('unexpected_hook_execution');
        }
    }
}
