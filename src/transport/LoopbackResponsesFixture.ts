// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { CodexJsonlCodec } from './CodexJsonlCodec.ts';

export const FIXTURE_MODEL = 'native-pilot-fixture';
export const FIXTURE_REPLY = 'NATIVE_PILOT_ACK';
export type FixtureRequest = {
    method: string;
    path: string;
    headers: Record<string, string | string[] | undefined>;
    body: Uint8Array;
};
export type FixtureResponse = { status: number; headers: Record<string, string>; body: Uint8Array };
export type FixtureHost = {
    start(
        handler: (request: FixtureRequest) => FixtureResponse,
        limits: { address: '127.0.0.1'; requests: 1; bodyBytes: 1_048_576; timeoutMs: 10_000 },
    ): Promise<{ baseUrl: string; close(): Promise<void> }>;
};

/** One fixed response, no auth, forwarding, model inference or tool execution. */
export class LoopbackResponsesFixture {
    private requests = 0;
    private input: any;
    private requestDigest: string | undefined;
    private failure: Error | undefined;
    private readonly reply: Uint8Array;

    constructor() {
        const output = [
            {
                id: 'msg_native_pilot',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: FIXTURE_REPLY, annotations: [] }],
            },
        ];
        const events = [
            {
                type: 'response.created',
                response: {
                    id: 'resp_native_pilot',
                    object: 'response',
                    status: 'in_progress',
                    output: [],
                },
            },
            { type: 'response.output_item.done', output_index: 0, item: output[0] },
            {
                type: 'response.completed',
                response: {
                    id: 'resp_native_pilot',
                    object: 'response',
                    status: 'completed',
                    output,
                    usage: {
                        input_tokens: 0,
                        output_tokens: 0,
                        total_tokens: 0,
                        input_tokens_details: { cached_tokens: 0 },
                        output_tokens_details: { reasoning_tokens: 0 },
                    },
                },
            },
        ];
        this.reply = Buffer.from(
            events
                .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
                .join(''),
        );
    }

    handle = (request: FixtureRequest): FixtureResponse => {
        try {
            if (
                ++this.requests !== 1 ||
                request.method !== 'POST' ||
                request.path !== '/v1/responses' ||
                request.body.length > 1_048_576
            )
                throw new Error('fixture_request_boundary');
            for (const [name, value] of Object.entries(request.headers)) {
                if (
                    /(?:authorization|cookie|api[-_]?key|proxy|token)/i.test(name) &&
                    value !== undefined
                )
                    throw new Error('fixture_credentials');
            }
            const body = CodexJsonlCodec.json(request.body) as any;
            const fields = [
                'model',
                'instructions',
                'input',
                'tools',
                'tool_choice',
                'parallel_tool_calls',
                'reasoning',
                'store',
                'stream',
                'stream_options',
                'include',
                'service_tier',
                'prompt_cache_key',
                'text',
                'client_metadata',
                'access_programs',
            ];
            if (
                !body ||
                typeof body !== 'object' ||
                Array.isArray(body) ||
                Object.keys(body).some((key) => !fields.includes(key)) ||
                body.model !== FIXTURE_MODEL ||
                body.store !== false ||
                body.stream !== true ||
                !Array.isArray(body.input) ||
                body.input.length > 64
            )
                throw new Error('fixture_request_schema');
            for (const item of body.input) {
                if (
                    !item ||
                    typeof item !== 'object' ||
                    item.type !== 'message' ||
                    !['system', 'developer', 'user', 'assistant'].includes(item.role) ||
                    !Array.isArray(item.content) ||
                    Object.keys(item).some(
                        (key) => !['type', 'role', 'content', 'id', 'phase'].includes(key),
                    )
                )
                    throw new Error('fixture_tool_or_unknown_input');
                for (const content of item.content) {
                    if (
                        !content ||
                        !['input_text', 'output_text'].includes(content.type) ||
                        typeof content.text !== 'string' ||
                        Object.keys(content).some(
                            (key) => !['type', 'text', 'annotations'].includes(key),
                        )
                    )
                        throw new Error('fixture_tool_or_unknown_input');
                }
            }
            if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 128))
                throw new Error('fixture_tools_schema');
            this.input = body;
            this.requestDigest = createHash('sha256').update(request.body).digest('hex');
            return {
                status: 200,
                headers: {
                    'content-type': 'text/event-stream',
                    connection: 'close',
                    'cache-control': 'no-store',
                },
                body: this.reply,
            };
        } catch (error) {
            this.failure = error instanceof Error ? error : new Error('fixture_failure');
            return {
                status: 400,
                headers: { 'content-type': 'application/json', connection: 'close' },
                body: Buffer.from('{"error":"fixture_request_rejected"}'),
            };
        }
    };

    observation(context: string): {
        requests: 1;
        request_sha256: string;
        response_sha256: string;
        advertised_tools: number;
        context_present: true;
    } {
        if (this.failure) throw this.failure;
        if (
            this.requests !== 1 ||
            !this.requestDigest ||
            !context ||
            !JSON.stringify(this.input).includes(JSON.stringify(context).slice(1, -1))
        )
            throw new Error('fixture_context_not_observed');
        return {
            requests: 1,
            request_sha256: this.requestDigest,
            response_sha256: createHash('sha256').update(this.reply).digest('hex'),
            advertised_tools: this.input.tools?.length ?? 0,
            context_present: true,
        };
    }
}
