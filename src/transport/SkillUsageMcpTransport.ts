// SPDX-License-Identifier: Apache-2.0
import type { Readable, Writable } from 'node:stream';
import type { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

type Store = Pick<SkillReadRepository, 'record' | 'rank' | 'close'>;
type Request = {
    jsonrpc: '2.0';
    method: string;
    id?: string | number;
    params?: Record<string, unknown>;
};

const eventFields = ['event_id', 'collection', 'skill', 'revision', 'session', 'occurred_at'];
const tools = [
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
];

function isRequest(value: unknown): value is Request {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const request = value as Request;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') return false;
    if (!Object.hasOwn(request, 'id')) return true;
    return typeof request.id === 'string' || Number.isSafeInteger(request.id);
}

/** Adapts bounded MCP requests to explicit read storage and ranking operations. */
export class SkillUsageMcpTransport {
    /** Bounded newline-delimited JSON-RPC. The returned promise owns server lifetime. */
    async startServer(
        store: Store,
        input: Readable = process.stdin,
        output: Writable = process.stdout,
    ): Promise<void> {
        let initialized = false;
        let ready = false;
        let buffer = Buffer.alloc(0);

        function callTool(params: Request['params']) {
            const name = params?.name;
            const args = params?.arguments ?? {};

            try {
                const handlers: Record<string, (input: unknown) => unknown> = {
                    skill_read_record: (value) => store.record(value),
                    skill_read_rankings: (value) => store.rank(value),
                };
                const handler =
                    typeof name === 'string' && Object.hasOwn(handlers, name)
                        ? handlers[name]
                        : undefined;
                if (!handler) throw new Error('Unknown tool');

                const value = handler(args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(value) }],
                    structuredContent: value,
                };
            } catch {
                return {
                    isError: true,
                    content: [
                        {
                            type: 'text',
                            text: 'Invalid tool input or unavailable storage; no evidence inferred.',
                        },
                    ],
                };
            }
        }

        function dispatch(request: Request): unknown {
            if (request.method === 'initialize') {
                if (initialized) throw new Error('Already initialized');
                initialized = true;
                return {
                    protocolVersion: '2025-11-25',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'skill-usage', version: '0.1.0' },
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

        const outputFailed = (error: Error) => input.destroy(error);
        const outputClosed = () => input.destroy(new Error('MCP output closed'));
        output.once('error', outputFailed);
        output.once('close', outputClosed);

        try {
            for await (const chunk of input) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                let offset = 0;

                while (offset < bytes.length) {
                    const newline = bytes.indexOf(10, offset);
                    const end = newline === -1 ? bytes.length : newline;
                    if (buffer.length + end - offset > 65536) return;

                    buffer = Buffer.concat([buffer, bytes.subarray(offset, end)]);
                    if (newline === -1) break;

                    const response = handle(buffer);
                    buffer = Buffer.alloc(0);
                    offset = newline + 1;
                    // One response at a time. A stalled peer cannot cause an
                    // unbounded output queue or additional storage operations.
                    if (response !== undefined) await this.send(output, response);
                }
            }
        } finally {
            output.off('error', outputFailed);
            output.off('close', outputClosed);
            store.close();
        }
    }

    private send(output: Writable, response: unknown): Promise<void> {
        return new Promise((resolve, reject) => {
            const close = () => finish(new Error('MCP output closed'));
            const finish = (error?: Error | null) => {
                output.off('error', finish);
                output.off('close', close);
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            };

            output.once('error', finish);
            output.once('close', close);
            output.write(`${JSON.stringify(response)}\n`, finish);
        });
    }
}
