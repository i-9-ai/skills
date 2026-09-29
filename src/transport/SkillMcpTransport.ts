// SPDX-License-Identifier: Apache-2.0
import { fstatSync } from 'node:fs';
import { Socket } from 'node:net';
import type { Readable, Writable } from 'node:stream';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { SkillEvidenceToolConfiguration } from '../config/SkillEvidenceToolConfiguration.ts';

export type SkillMcpOperations = {
    record(value: unknown): unknown;
    rank(value: unknown): unknown;
    search(value: unknown): unknown;
    read(value: unknown): unknown;
    overview(value: unknown): unknown;
    recordLifecycle(value: unknown): unknown;
    observeCatalog(value: unknown): unknown;
    lifecycle(value: unknown): unknown;
    overlap(value: unknown): unknown;
    inactivity(value: unknown): unknown;
    catalogHistory(value: unknown): unknown;
    close(): void;
};
export const MAX_MCP_REQUEST_BYTES = 1_048_576;
export const MAX_MCP_RESPONSE_BYTES = 1_048_576;
export const MAX_MCP_ID_BYTES = 1024;
type Request = {
    jsonrpc: '2.0';
    method: string;
    id?: string | number;
    params?: Record<string, unknown>;
};

const eventFields = ['event_id', 'collection', 'skill', 'revision', 'session', 'occurred_at'];
const tools = [
    ...SkillEvidenceToolConfiguration.tools,
    {
        name: 'skill_read_record',
        description:
            'Record an explicitly observed read, never an inferred activation. Retry with the same event ID.',
        inputSchema: {
            type: 'object',
            properties: Object.fromEntries(eventFields.map((field) => [field, { type: 'string' }])),
            required: eventFields,
            additionalProperties: false,
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    },
    {
        name: 'skill_read_rankings',
        description:
            'Rank observed reads and distinct opaque sessions over a half-open UTC period.',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string' },
                until: { type: 'string' },
                limit: { type: 'integer', minimum: 1, maximum: 100 },
            },
            additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
        name: 'skill_catalog_search',
        description:
            'Search the installed canonical skill catalog by literal metadata text. No state is written.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', maxLength: 200 },
                limit: { type: 'integer', minimum: 1, maximum: 50 },
                offset: { type: 'integer', minimum: 0, maximum: 256 },
            },
            additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
        name: 'skill_resource_read',
        description:
            'Read a cataloged SKILL.md or references/ Markdown file with exact byte provenance. Never executes scripts or records usage.',
        inputSchema: {
            type: 'object',
            properties: {
                skill: { type: 'string', maxLength: 64 },
                resource: { type: 'string', maxLength: 1024, default: 'SKILL.md' },
            },
            required: ['skill'],
            additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
        name: 'skill_catalog_overview',
        description:
            'Show bounded installed skill metadata for routing. Read the selected SKILL.md before using it.',
        inputSchema: {
            type: 'object',
            properties: { max_entries: { type: 'integer', minimum: 1, maximum: 24 } },
            additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
];

function toolError(error: SkillOperationError) {
    return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
        structuredContent: { error: { code: error.code, message: error.message } },
    };
}

function isRequest(value: unknown): value is Request {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const request = value as Request;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') return false;
    if (!Object.hasOwn(request, 'id')) return true;
    // IDs are echoed even in errors. Bound their serialized form, including
    // escaping, before dispatch so the size-error response always fits.
    if (typeof request.id === 'string')
        return Buffer.byteLength(JSON.stringify(request.id), 'utf8') <= MAX_MCP_ID_BYTES;
    return Number.isSafeInteger(request.id);
}

/** Adapts one bounded MCP lifetime to installed catalog and explicit usage operations. */
export class SkillMcpTransport {
    /** Bounded newline-delimited JSON-RPC. The returned promise owns server lifetime. */
    async startServer(
        store: SkillMcpOperations,
        input: Readable = process.stdin,
        output?: Writable,
    ): Promise<void> {
        let stdoutPipe: Socket | undefined;
        try {
            if (output === undefined && process.platform !== 'win32') {
                const descriptor = fstatSync(1);
                if (descriptor.isFIFO() || descriptor.isSocket()) {
                    // Node's process.stdout.destroy() leaves fd 1 and pending
                    // writes open. Own the sole protocol writer for this lifetime.
                    stdoutPipe = new Socket({ fd: 1, readable: false, writable: true });
                }
            }
            await this.serve(store, input, output ?? stdoutPipe ?? process.stdout);
        } finally {
            stdoutPipe?.destroy();
            store.close();
        }
    }

    private async serve(
        store: SkillMcpOperations,
        input: Readable,
        output: Writable,
    ): Promise<void> {
        let initialized = false;
        let ready = false;
        let buffer = Buffer.alloc(0);

        function callTool(params: Request['params']) {
            const name = params?.name;
            const args = params?.arguments === undefined ? {} : params.arguments;

            try {
                const handlers: Record<string, (input: unknown) => unknown> = {
                    skill_read_record: (value) => store.record(value),
                    skill_read_rankings: (value) => store.rank(value),
                    skill_catalog_search: (value) => store.search(value),
                    skill_resource_read: (value) => store.read(value),
                    skill_catalog_overview: (value) => store.overview(value),
                    skill_lifecycle_record: (value) => store.recordLifecycle(value),
                    skill_catalog_observe: (value) => store.observeCatalog(value),
                    skill_lifecycle_metrics: (value) => store.lifecycle(value),
                    skill_routing_overlap: (value) => store.overlap(value),
                    skill_catalog_inactivity: (value) => store.inactivity(value),
                    skill_catalog_history: (value) => store.catalogHistory(value),
                };
                const handler =
                    typeof name === 'string' && Object.hasOwn(handlers, name)
                        ? handlers[name]
                        : undefined;
                if (!handler) throw new SkillOperationError('unknown_tool');

                const value = handler(args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(value) }],
                    structuredContent: value,
                };
            } catch (error) {
                return toolError(
                    error instanceof SkillOperationError
                        ? error
                        : new SkillOperationError('invalid_input'),
                );
            }
        }

        function dispatch(request: Request): unknown {
            if (request.method === 'initialize') {
                if (initialized) throw new Error('Already initialized');
                initialized = true;
                return {
                    protocolVersion: '2025-11-25',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'i9-skills', version: '0.1.0' },
                };
            }

            if (request.method === 'ping') return {};
            if (!ready) throw new Error('Initialize first');
            if (request.method === 'tools/list') return { tools };
            if (request.method === 'tools/call') return callTool(request.params);
            return undefined;
        }

        function handle(line: Buffer): unknown {
            let value: unknown;

            try {
                value = strictJson(line);
            } catch {
                return {
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32700, message: 'Parse error' },
                };
            }

            if (!isRequest(value)) {
                return {
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32600, message: 'Invalid request' },
                };
            }

            if (!Object.hasOwn(value, 'id')) {
                if (value.method === 'notifications/initialized' && initialized) ready = true;
                return;
            }

            try {
                const result = dispatch(value);
                if (result === undefined) {
                    return {
                        jsonrpc: '2.0',
                        id: value.id,
                        error: { code: -32601, message: 'Method not found' },
                    };
                }
                return { jsonrpc: '2.0', id: value.id, result };
            } catch {
                return {
                    jsonrpc: '2.0',
                    id: value.id,
                    error: { code: -32602, message: 'Invalid protocol state or parameters' },
                };
            }
        }

        const cancellation = new AbortController();
        const inputFailed = (error: Error) => cancellation.abort(error);
        const inputClosed = () => {
            if (!input.readableEnded) cancellation.abort(new Error('MCP input closed'));
        };
        const outputFailed = (error: Error) => {
            cancellation.abort(error);
            input.destroy(error);
        };
        const outputClosed = () => outputFailed(new Error('MCP output closed'));
        input.once('error', inputFailed);
        input.once('close', inputClosed);
        output.once('error', outputFailed);
        output.once('close', outputClosed);

        try {
            for await (const chunk of input) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                let offset = 0;

                while (offset < bytes.length) {
                    cancellation.signal.throwIfAborted();
                    const newline = bytes.indexOf(10, offset);
                    const end = newline === -1 ? bytes.length : newline;
                    if (buffer.length + end - offset > MAX_MCP_REQUEST_BYTES) return;

                    buffer = Buffer.concat([buffer, bytes.subarray(offset, end)]);
                    if (newline === -1) break;

                    const response = handle(buffer);
                    buffer = Buffer.alloc(0);
                    offset = newline + 1;
                    // One response at a time. A stalled peer cannot cause an
                    // unbounded output queue or additional storage operations.
                    if (response !== undefined) {
                        await this.send(output, response, cancellation.signal);
                    }
                }
            }
        } finally {
            input.off('error', inputFailed);
            input.off('close', inputClosed);
            output.off('error', outputFailed);
            output.off('close', outputClosed);
        }
    }

    private send(output: Writable, response: unknown, signal: AbortSignal): Promise<void> {
        let serialized = `${JSON.stringify(response)}\n`;
        if (Buffer.byteLength(serialized, 'utf8') > MAX_MCP_RESPONSE_BYTES) {
            serialized = `${JSON.stringify({
                jsonrpc: '2.0',
                id: (response as { id: unknown }).id,
                result: toolError(new SkillOperationError('response_too_large')),
            })}\n`;
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            const settle = (error?: Error | null) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', aborted);
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            };
            const aborted = () => {
                output.destroy();
                settle(signal.reason);
            };
            const close = () => finish(new Error('MCP output closed'));
            const finish = (error?: Error | null) => {
                output.off('error', finish);
                output.off('close', close);
                settle(error);
            };

            if (output.destroyed) {
                settle(new Error('MCP output closed'));
                return;
            }

            // Cancellation destroys a stalled writer. Keep its error handler
            // through destruction so late write/close failures stay handled.
            // Writable reports callback errors before emitting its error event.
            output.once('error', finish);
            output.once('close', close);
            signal.addEventListener('abort', aborted, { once: true });
            if (signal.aborted) {
                aborted();
                return;
            }

            try {
                output.write(serialized, (error) => {
                    if (!error) finish();
                });
            } catch (error) {
                finish(error as Error);
            }
        });
    }
}
