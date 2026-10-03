// SPDX-License-Identifier: Apache-2.0
import { basename, dirname } from 'node:path';
import { ReleaseReferenceRepository } from '../repository/ReleaseReferenceRepository.ts';
import type { ReleaseReferenceMode } from '../repository/ReleaseReferenceRepository.ts';
import { ReleaseReferenceValidator } from '../validator/ReleaseReferenceValidator.ts';
import type {
    ReleaseReferenceIdentity,
    ReleaseReferenceReceipt,
    ReleaseReferenceExchange,
} from '../validator/ReleaseReferenceValidator.ts';

/** Records public GitHub data or replays exact queries inside the explicit version subprocess only. */
export class ReleaseReferenceRunner {
    private readonly mode: ReleaseReferenceMode;
    private readonly identity: ReleaseReferenceIdentity;
    private readonly exchanges: ReleaseReferenceExchange[];
    private readonly fetcher: typeof globalThis.fetch;
    private readonly validator = new ReleaseReferenceValidator();
    private readonly used = new Set<string>();
    private failed = false;

    constructor(
        mode: ReleaseReferenceMode,
        receipt: ReleaseReferenceReceipt,
        fetcher = globalThis.fetch,
    ) {
        const valid = this.validator.receipt(receipt);
        if (mode !== 'record' && mode !== 'replay')
            throw new Error('Invalid release reference mode.');
        const { exchanges, sha256: _digest, ...identity } = valid;
        if (mode === 'record' && exchanges.length)
            throw new Error('Recording requires fresh GitHub reference evidence.');
        this.mode = mode;
        this.identity = identity;
        this.exchanges = structuredClone(exchanges);
        this.fetcher = fetcher;
    }

    async fetch(
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
    ): Promise<Response> {
        try {
            if (
                String(input) !== 'https://api.github.com/graphql' ||
                init?.method !== 'POST' ||
                typeof init.body !== 'string' ||
                init.body.length > 32_768
            )
                throw new Error('Unsupported release reference request.');
            const body = JSON.parse(init.body) as Record<string, unknown>;
            if (
                !body ||
                typeof body !== 'object' ||
                Array.isArray(body) ||
                Object.keys(body).length !== 1 ||
                typeof body.query !== 'string'
            )
                throw new Error('Unsupported release reference query body.');
            const query = body.query;
            this.validator.query(this.identity.repo, query);
            if (
                this.used.has(query) ||
                this.used.size >= ReleaseReferenceValidator.maximumExchanges
            )
                throw new Error('Duplicate or excessive GitHub release reference queries.');
            this.used.add(query);
            if (this.mode === 'replay') {
                const exchange = this.exchanges.find((entry) => entry.query === query);
                if (!exchange) throw new Error('Missing GitHub release reference query evidence.');
                return new Response(JSON.stringify({ data: exchange.data }), { status: 200 });
            }

            let authorization: string | null;
            try {
                authorization = new Headers(init.headers).get('Authorization');
            } catch {
                throw new Error(
                    'Invalid explicit GitHub authentication for reference preparation.',
                );
            }
            if (
                !authorization?.startsWith('Token ') ||
                authorization.length < 7 ||
                authorization.length > 16_384
            )
                throw new Error(
                    'Explicit GitHub authentication is required for reference preparation.',
                );
            const publicQuery = query.replace('  ) {\n', '  ) {\n    isPrivate\n');
            let response: Response;
            try {
                response = await this.fetcher('https://api.github.com/graphql', {
                    method: 'POST',
                    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: publicQuery }),
                    redirect: 'error',
                    signal: AbortSignal.timeout(10_000),
                });
            } catch {
                throw new Error('GitHub reference preparation request failed.');
            }
            if (!response.ok)
                throw new Error('GitHub reference preparation returned an unsuccessful response.');
            const data = this.validator.providerData(
                this.identity.repo,
                query,
                await this.responseJson(response),
            );
            this.exchanges.push({ query, data });
            const receipt = this.validator.seal(this.identity, this.exchanges);
            return new Response(JSON.stringify({ data: receipt.exchanges.at(-1)!.data }), {
                status: 200,
            });
        } catch (error) {
            this.failed = true;
            throw error;
        }
    }

    complete(): ReleaseReferenceReceipt {
        if (this.failed || this.exchanges.length !== this.used.size)
            throw new Error('Incomplete or unused GitHub release reference evidence.');
        return this.validator.seal(this.identity, this.exchanges);
    }

    private async responseJson(response: Response): Promise<unknown> {
        const declared = response.headers.get('content-length');
        if (
            declared !== null &&
            (!/^\d+$/u.test(declared) || Number(declared) > ReleaseReferenceValidator.maximumBytes)
        )
            throw new Error('GitHub reference response exceeds the supported byte limit.');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('GitHub reference response has no body.');
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        try {
            for (;;) {
                const result = await reader.read();
                if (result.done) break;
                bytes += result.value.byteLength;
                if (bytes > ReleaseReferenceValidator.maximumBytes)
                    throw new Error('GitHub reference response exceeds the supported byte limit.');
                chunks.push(result.value);
            }
            try {
                return JSON.parse(
                    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
                );
            } catch {
                throw new Error('GitHub reference response has an invalid JSON body.');
            }
        } finally {
            await reader.cancel();
        }
    }
}

// Only the repository adapter supplies this control for an owned child process.
const controlPath = process.env.I9_RELEASE_REFERENCE_CONTROL;
if (controlPath) {
    if (basename(controlPath) !== 'control.json')
        throw new Error('Invalid release reference control path.');
    const repository = new ReleaseReferenceRepository(dirname(controlPath));
    const control = repository.control();
    if (control.mode === 'record' && !process.env.GITHUB_TOKEN)
        throw new Error(
            'Reference preparation requires an existing GITHUB_TOKEN environment variable.',
        );
    if (control.mode === 'record' && !/^[\x21-\x7e]{1,16378}$/u.test(process.env.GITHUB_TOKEN!))
        throw new Error(
            'Reference preparation requires a valid existing GITHUB_TOKEN environment variable.',
        );
    process.env.GITHUB_TOKEN =
        control.mode === 'replay' ? 'offline-release-reference-replay' : process.env.GITHUB_TOKEN;
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    process.env.GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
    process.env.GITHUB_REPOSITORY = control.receipt.repo;
    const runner = new ReleaseReferenceRunner(control.mode, control.receipt);
    globalThis.fetch = runner.fetch.bind(runner);
    process.once('beforeExit', () => repository.writeResult(runner.complete()));
}
