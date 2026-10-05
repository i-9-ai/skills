// SPDX-License-Identifier: Apache-2.0
import type { Schema } from '../repository/NativeCodexSchemaRepository.ts';
import { NativeCodexSchemaRepository } from '../repository/NativeCodexSchemaRepository.ts';
import { NativeCodexDiagnosticValidator } from './NativeCodexDiagnosticValidator.ts';

const keywords = new Set([
    '$ref',
    '$schema',
    'additionalProperties',
    'allOf',
    'anyOf',
    'default',
    'definitions',
    'description',
    'enum',
    'format',
    'items',
    'minLength',
    'minimum',
    'oneOf',
    'properties',
    'required',
    'title',
    'type',
]);
export const RPC_SCHEMAS = {
    initialize: ['v1/InitializeParams.json', 'v1/InitializeResponse.json'],
    'account/read': ['v2/GetAccountParams.json', 'v2/GetAccountResponse.json'],
    'skills/list': ['v2/SkillsListParams.json', 'v2/SkillsListResponse.json'],
    'hooks/list': ['v2/HooksListParams.json', 'v2/HooksListResponse.json'],
    'config/batchWrite': ['v2/ConfigBatchWriteParams.json', 'v2/ConfigWriteResponse.json'],
    'thread/start': ['v2/ThreadStartParams.json', 'v2/ThreadStartResponse.json'],
    'turn/start': ['v2/TurnStartParams.json', 'v2/TurnStartResponse.json'],
    'mcpServerStatus/list': [
        'v2/ListMcpServerStatusParams.json',
        'v2/ListMcpServerStatusResponse.json',
    ],
    'mcpServer/tool/call': ['v2/McpServerToolCallParams.json', 'v2/McpServerToolCallResponse.json'],
    'mcpServer/resource/read': ['v2/McpResourceReadParams.json', 'v2/McpResourceReadResponse.json'],
} as const;
const NOTIFICATIONS: Record<string, string> = {
    'thread/started': 'ThreadStartedNotification',
    'thread/status/changed': 'ThreadStatusChangedNotification',
    'turn/started': 'TurnStartedNotification',
    'turn/completed': 'TurnCompletedNotification',
    'hook/started': 'HookStartedNotification',
    'hook/completed': 'HookCompletedNotification',
    'item/started': 'ItemStartedNotification',
    'item/completed': 'ItemCompletedNotification',
    'item/agentMessage/delta': 'AgentMessageDeltaNotification',
    'thread/tokenUsage/updated': 'ThreadTokenUsageUpdatedNotification',
    'mcpServer/startupStatus/updated': 'McpServerStatusUpdatedNotification',
    'account/updated': 'AccountUpdatedNotification',
    'account/rateLimits/updated': 'AccountRateLimitsUpdatedNotification',
    configWarning: 'ConfigWarningNotification',
    'remoteControl/status/changed': 'RemoteControlStatusChangedNotification',
};
export type RpcMethod = keyof typeof RPC_SCHEMAS;

/** A deliberately selected, closed Draft-7 subset; unknown data or diagnostics fail closed. */
export class NativeCodexProtocolValidator {
    private readonly repository: NativeCodexSchemaRepository;
    constructor(repository: NativeCodexSchemaRepository) {
        this.repository = repository;
    }
    request(method: RpcMethod, value: unknown): void {
        this.schema(RPC_SCHEMAS[method][0], value);
    }
    response(method: RpcMethod, value: unknown): void {
        this.schema(RPC_SCHEMAS[method][1], value);
    }
    notification(method: string, value: unknown): void {
        if (!Object.hasOwn(NOTIFICATIONS, method)) throw new Error('unexpected_notification');
        this.schema(`v2/${NOTIFICATIONS[method]}.json`, value);
        if (method === 'configWarning') new NativeCodexDiagnosticValidator().configWarning(value);
        if (method === 'remoteControl/status/changed') {
            const status = value as Record<string, unknown>;
            if (
                status.status !== 'disabled' ||
                status.environmentId !== null ||
                typeof status.serverName !== 'string' ||
                !status.serverName.length ||
                status.serverName.length > 256 ||
                typeof status.installationId !== 'string' ||
                !status.installationId.length ||
                status.installationId.length > 256 ||
                /[\u0000-\u001f\u007f]/.test(status.serverName + status.installationId)
            )
                throw new Error('native_remote_control_not_disabled');
        }
    }
    schema(name: string, value: unknown): void {
        const root = this.repository.get(name);
        let steps = 0;
        const dereference = (schema: Schema): Schema => {
            if (typeof schema === 'boolean' || !schema.$ref) return schema;
            if (!/^#\/definitions\/[A-Za-z0-9_]+$/.test(schema.$ref))
                throw new Error('schema_reference');
            const resolved = (root as any).definitions?.[schema.$ref.slice(14)];
            if (!resolved) throw new Error('schema_reference');
            return resolved;
        };
        const names = (schema: Schema, depth = 0): Set<string> => {
            if (depth > 48) throw new Error('schema_depth');
            const selected = dereference(schema);
            if (typeof selected === 'boolean') return new Set();
            const keys = new Set<string>(Object.keys(selected.properties ?? {}));
            for (const key of ['anyOf', 'oneOf', 'allOf'])
                for (const branch of selected[key] ?? [])
                    for (const name of names(branch, depth + 1)) keys.add(name);
            return keys;
        };
        const check = (
            raw: Schema,
            input: any,
            depth = 0,
            inherited = new Set<string>(),
        ): boolean => {
            if (depth > 48 || ++steps > 200_000) throw new Error('schema_validation_bound');
            const schema = dereference(raw);
            if (typeof schema === 'boolean') return schema;
            if (Object.keys(schema).some((key) => !keywords.has(key)))
                throw new Error('schema_keyword');
            if (schema.type) {
                const types = Array.isArray(schema.type) ? schema.type : [schema.type];
                const actual =
                    input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input;
                if (
                    !types.some(
                        (type: string) =>
                            type === actual || (type === 'integer' && Number.isSafeInteger(input)),
                    )
                )
                    return false;
            }
            if (
                schema.enum &&
                !schema.enum.some((item: unknown) => JSON.stringify(item) === JSON.stringify(input))
            )
                return false;
            if (
                typeof input === 'number' &&
                (!Number.isFinite(input) ||
                    (schema.minimum !== undefined && input < schema.minimum))
            )
                return false;
            if (
                typeof input === 'string' &&
                schema.minLength !== undefined &&
                [...input].length < schema.minLength
            )
                return false;
            if (
                schema.format &&
                !['int32', 'int64', 'uint', 'uint32', 'uint64', 'double', 'float'].includes(
                    schema.format,
                )
            )
                throw new Error('schema_format');
            if (
                schema.format &&
                /^(u?int)/.test(schema.format) &&
                input !== null &&
                !Number.isSafeInteger(input)
            )
                return false;
            const allowed = new Set([...inherited, ...names(schema)]);
            const branchAllowed = new Set([...inherited, ...Object.keys(schema.properties ?? {})]);
            for (const branch of schema.allOf ?? [])
                for (const key of names(branch)) branchAllowed.add(key);
            if (
                schema.allOf &&
                !schema.allOf.every((branch: Schema) =>
                    check(branch, input, depth + 1, branchAllowed),
                )
            )
                return false;
            if (
                schema.anyOf &&
                !schema.anyOf.some((branch: Schema) =>
                    check(branch, input, depth + 1, branchAllowed),
                )
            )
                return false;
            if (
                schema.oneOf &&
                schema.oneOf.filter((branch: Schema) =>
                    check(branch, input, depth + 1, branchAllowed),
                ).length !== 1
            )
                return false;
            if (
                Array.isArray(input) &&
                schema.items &&
                !input.every((item) => check(schema.items, item, depth + 1))
            )
                return false;
            if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
                if (schema.required?.some((key: string) => !Object.hasOwn(input, key)))
                    return false;
                for (const [key, item] of Object.entries(input)) {
                    if (Object.hasOwn(schema.properties ?? {}, key)) {
                        if (!check(schema.properties[key], item, depth + 1)) return false;
                        continue;
                    }
                    if (allowed.has(key)) continue;
                    if (schema.additionalProperties === true) continue;
                    if (
                        schema.additionalProperties &&
                        typeof schema.additionalProperties === 'object'
                    ) {
                        if (!check(schema.additionalProperties, item, depth + 1)) return false;
                        continue;
                    }
                    // Empty schemas are intentionally arbitrary JSON; named objects are closed.
                    if (
                        Object.keys(schema).every((key) =>
                            ['description', 'default', 'title'].includes(key),
                        )
                    )
                        continue;
                    return false;
                }
            }
            return true;
        };
        if (!check(root, value)) throw new Error(`schema_mismatch:${name}`);
    }
}
