// SPDX-License-Identifier: Apache-2.0
import { posix } from 'node:path';
import type { ObserverConfinement } from './NativeCodexObservationService.ts';
import { NativeCodexObservationError } from '../validator/NativeCodexObservationError.ts';
import { NativeCodexConfiguration } from '../config/NativeCodexConfiguration.ts';
import { NativeCodexProtocolValidator } from '../validator/NativeCodexProtocolValidator.ts';
import type { RpcMethod } from '../validator/NativeCodexProtocolValidator.ts';
import { CodexRpcSession } from '../transport/CodexRpcSession.ts';
import type { Notification } from '../transport/CodexRpcSession.ts';

export interface NativeCodexAbsenceInput {
    schema_version: 1;
    phase: 'baseline' | 'verify-absent';
    source_tree_sha256: string;
    image_home: string;
    plugin_id: 'i9-skills@i9-skills';
}

/** One fixed no-thread/no-turn inventory recipe for the fresh disposable Codex lane. */
export class NativeCodexAbsenceObservationService {
    private readonly protocol: NativeCodexProtocolValidator;
    constructor(protocol: NativeCodexProtocolValidator) {
        this.protocol = protocol;
    }

    input(value: NativeCodexAbsenceInput): void {
        if (
            !value ||
            Object.keys(value).length !== 5 ||
            Object.keys(value).some(
                (key) =>
                    ![
                        'schema_version',
                        'phase',
                        'source_tree_sha256',
                        'image_home',
                        'plugin_id',
                    ].includes(key),
            ) ||
            value.schema_version !== 1 ||
            !['baseline', 'verify-absent'].includes(value.phase) ||
            !/^[0-9a-f]{64}$/.test(value.source_tree_sha256) ||
            value.image_home !== posix.join('/', 'home', 'node') ||
            value.plugin_id !== 'i9-skills@i9-skills'
        )
            throw new Error('native_absence_input');
    }

    requests() {
        return [
            {
                id: 1,
                method: 'initialize' as RpcMethod,
                params: {
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
                },
            },
            { method: 'initialized' as const },
            { id: 2, method: 'account/read' as RpcMethod, params: { refreshToken: false } },
            {
                id: 3,
                method: 'skills/list' as RpcMethod,
                params: { cwds: ['/pilot/consumer'], forceReload: true },
            },
            { id: 4, method: 'hooks/list' as RpcMethod, params: { cwds: ['/pilot/consumer'] } },
            {
                id: 5,
                method: 'mcpServerStatus/list' as RpcMethod,
                params: {
                    threadId: null,
                    serverName: null,
                    cursor: null,
                    limit: 50,
                    detail: 'full',
                },
            },
        ];
    }

    derive(
        input: NativeCodexAbsenceInput,
        results: any[],
        notifications: readonly Notification[],
        identity: { pid: number; start_ticks: string },
        fixtureBaseUrl: string,
        notices: unknown,
    ) {
        this.input(input);
        if (results.length !== 5) throw new Error('native_absence_incomplete');
        for (const [index, request] of this.requests()
            .filter((row) => row.method !== 'initialized')
            .entries()) {
            this.protocol.response(request.method as RpcMethod, results[index]);
        }
        const [initialized, account, listed, hooks, mcp] = results;
        if (
            initialized.codexHome !== `${input.image_home}/.codex` ||
            initialized.platformFamily !== 'unix' ||
            initialized.platformOs !== 'linux' ||
            !/(?:^|[^\d])0\.160\.0(?:[^\d]|$)/.test(initialized.userAgent)
        )
            throw new Error('native_absence_identity');
        if (
            account.account !== null ||
            account.requiresOpenaiAuth !== false ||
            account.workspaceRouting !== null
        )
            throw new Error('native_absence_authenticated');
        if (
            listed.data.length !== 1 ||
            listed.data[0].cwd !== '/pilot/consumer' ||
            listed.data[0].errors.length ||
            listed.data[0].skills.length > 256
        )
            throw new Error('native_absence_skill_diagnostic');
        const skills = listed.data[0].skills;
        const paths = new Set<string>();
        for (const skill of skills) {
            if (
                typeof skill.path !== 'string' ||
                !skill.path.startsWith('/') ||
                posix.normalize(skill.path) !== skill.path ||
                paths.has(skill.path)
            )
                throw new Error('native_absence_skill_path');
            paths.add(skill.path);
            if (
                skill.pluginId === input.plugin_id ||
                skill.name.startsWith('i9-skills:') ||
                skill.path === '/pilot/source' ||
                skill.path.startsWith('/pilot/source/') ||
                skill.path.startsWith(`${input.image_home}/.codex/plugins/cache/i9-skills/`)
            )
                throw new Error('native_absence_owned_skill_loaded');
        }
        // This fresh pilot has no active unrelated consumer. Nonempty or diagnostic
        // hook/MCP inventories are retained and blocked, never classified by guesswork.
        if (
            hooks.data.length !== 1 ||
            hooks.data[0].cwd !== '/pilot/consumer' ||
            hooks.data[0].errors.length ||
            hooks.data[0].warnings.length ||
            hooks.data[0].hooks.length
        )
            throw new Error('native_absence_hook_inventory_not_empty');
        if (mcp.data.length !== 0 || mcp.nextCursor !== null)
            throw new Error('native_absence_mcp_inventory_not_empty');
        const passive = new Set([
            'configWarning',
            'remoteControl/status/changed',
            'account/updated',
            'account/rateLimits/updated',
        ]);
        for (const notification of notifications) {
            if (!passive.has(notification.method))
                throw new Error('native_absence_unexpected_activity');
            this.protocol.notification(notification.method, notification.params);
            if (notification.method === 'account/updated' && notification.params.authMode !== null)
                throw new Error('native_absence_authenticated');
        }
        NativeCodexConfiguration.argv(fixtureBaseUrl);
        if (
            !Number.isSafeInteger(identity.pid) ||
            identity.pid < 2 ||
            !/^[1-9][0-9]*$/.test(identity.start_ticks)
        )
            throw new Error('native_absence_process_identity');
        return {
            schema_version: 1,
            scope: 'native-owned-absence-no-thread-no-turn',
            phase: input.phase,
            result: 'observed',
            source_commit: 'a956835d020762cb2b570053af06f643a11c0ecc',
            source_tree_sha256: input.source_tree_sha256,
            codex_home: initialized.codexHome,
            process_identity: identity,
            account: { account: null, requires_openai_auth: false, workspace_routing: null },
            inventory: {
                skills: skills.map((skill: any) => ({
                    name: skill.name,
                    path: skill.path,
                    plugin_id: skill.pluginId ?? null,
                })),
                hooks: [],
                mcp: [],
            },
            fixture_base_url: fixtureBaseUrl,
            retained_startup_notices: notices,
            unmeasured: [
                'native-registration-from-this-inventory',
                'native-read-tool-telemetry',
                'model-or-provider',
                'thread-or-turn',
                'native-absent-store-coverage',
            ],
        };
    }

    async observe(input: NativeCodexAbsenceInput, confinement: ObserverConfinement) {
        this.input(input);
        let session: CodexRpcSession | undefined;
        let host: { baseUrl: string; close(): Promise<void> } | undefined;
        let primary: unknown;
        try {
            host = await confinement.fixture.start(
                () => {
                    throw new Error('native_absence_http_request');
                },
                { address: '127.0.0.1', requests: 1, bodyBytes: 1_048_576, timeoutMs: 10_000 },
            );
            const process = await confinement.start(NativeCodexConfiguration.argv(host.baseUrl));
            session = new CodexRpcSession(process, this.protocol);
            if (!process.identity) throw new Error('native_absence_process_identity');
            const results = [];
            for (const request of this.requests()) {
                if (request.method === 'initialized') await session.initialized();
                else results.push(await session.request(request.method, request.params));
            }
            return this.derive(
                input,
                results,
                session.observed(),
                process.identity,
                host.baseUrl,
                session.diagnostics(),
            );
        } catch (error) {
            primary = error;
            throw error;
        } finally {
            let cleanup: unknown;
            try {
                await session?.close();
            } catch (error) {
                cleanup = error;
            }
            try {
                await host?.close();
            } catch (error) {
                cleanup ??= error;
            }
            if (cleanup) {
                if (primary) throw new NativeCodexObservationError(primary, cleanup);
                throw cleanup;
            }
        }
    }
}
