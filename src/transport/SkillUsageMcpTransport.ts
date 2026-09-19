// SPDX-License-Identifier: Apache-2.0
import type { Readable, Writable } from 'node:stream';
import type { SkillReadRepository } from '../repository/SkillReadRepository.ts';

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
    startServer(
        store: Store,
        input: Readable = process.stdin,
        output: Writable = process.stdout,
    ): Promise<void> {
        let initialized = false;
        let ready = false;
        let buffer = '';
        const send = (value: unknown) => output.write(`${JSON.stringify(value)}\n`);

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

        function handle(line: string): void {
            let value: unknown;

            try {
                value = JSON.parse(line);
            } catch {
                send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
                return;
            }

            if (!isRequest(value)) {
                send({
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32600, message: 'Invalid request' },
                });
                return;
            }

            if (!Object.hasOwn(value, 'id')) {
                if (value.method === 'notifications/initialized' && initialized) ready = true;
                return;
            }

            try {
                const result = dispatch(value);
                if (result === undefined) {
                    send({
                        jsonrpc: '2.0',
                        id: value.id,
                        error: { code: -32601, message: 'Method not found' },
                    });
                    return;
                }
                send({ jsonrpc: '2.0', id: value.id, result });
            } catch {
                send({
                    jsonrpc: '2.0',
                    id: value.id,
                    error: { code: -32602, message: 'Invalid protocol state or parameters' },
                });
            }
        }

        return new Promise((resolve, reject) => {
            let closed = false;

            function close(error?: Error): void {
                if (closed) return;
                closed = true;
                store.close();
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            }

            input.setEncoding('utf8');
            input.on('data', (chunk: string) => {
                buffer += chunk;

                while (buffer.includes('\n')) {
                    const end = buffer.indexOf('\n');
                    const line = buffer.slice(0, end);
                    buffer = buffer.slice(end + 1);

                    if (Buffer.byteLength(line) > 65536) {
                        input.destroy();
                        close();
                        return;
                    }
                    handle(line);
                }

                if (Buffer.byteLength(buffer) > 65536) {
                    input.destroy();
                    close();
                }
            });

            input.once('end', () => close());
            input.once('close', () => close());
            input.once('error', (error) => close(error));
        });
    }
}
