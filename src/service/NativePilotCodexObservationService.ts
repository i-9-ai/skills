// SPDX-License-Identifier: Apache-2.0
import { posix } from 'node:path';
import { NativeCodexObservationService } from './NativeCodexObservationService.ts';
import type {
    ArtifactInventory,
    ObserverInput,
    ObserverConfinement,
} from './NativeCodexObservationService.ts';
import { NativeCodexConfiguration } from '../config/NativeCodexConfiguration.ts';
import { NativeCodexProtocolValidator } from '../validator/NativeCodexProtocolValidator.ts';
import { NativePilotRegistrationObservationValidator } from '../validator/NativePilotRegistrationObservationValidator.ts';
import { CodexJsonlCodec } from '../transport/CodexJsonlCodec.ts';
import type { ProcessEvent } from '../transport/CodexRpcSession.ts';
import {
    projectionDigest,
    projectionObject,
    projectionPath,
} from '../repository/NativePilotObservationEvidenceRepository.ts';
import type { NativePilotExportEntry } from '../repository/NativePilotObservationEvidenceRepository.ts';
import { NativeCodexAbsenceObservationService } from './NativeCodexAbsenceObservationService.ts';
import type { NativeCodexAbsenceInput } from './NativeCodexAbsenceObservationService.ts';
import { NativeCodexDiagnosticValidator } from '../validator/NativeCodexDiagnosticValidator.ts';

export interface NativePilotCodexRetainedInput {
    input: ObserverInput;
    report: any;
    identity: any;
    events: any;
    outer_pid: number;
    request: Buffer;
    stdout: Buffer;
    stderr: Buffer;
    fixture_request: Buffer;
    fixture_response: Buffer;
    fixture_metadata: any;
    home: Map<string, NativePilotExportEntry>;
    states: Array<{
        snapshot: any;
        artifacts: Array<{ role: string; path: string; bytes: number; sha256: string }>;
    }>;
}

export interface NativePilotCodexAbsenceRetainedInput {
    input: NativeCodexAbsenceInput;
    report: any;
    identity: any;
    events: any;
    outer_pid: number;
    request: Buffer;
    stdout: Buffer;
    stderr: Buffer;
    fixture_request: Buffer;
    fixture_response: Buffer;
    fixture_metadata: any;
}

/** Revalidates inert measured transcripts with the bundled semantic recipe; never starts a process. */
export class NativePilotCodexObservationService {
    private readonly protocol: NativeCodexProtocolValidator;
    constructor(protocol: NativeCodexProtocolValidator) {
        this.protocol = protocol;
    }

    child(value: unknown, parent: number) {
        const receipt = projectionObject(value, [
            'schema_version',
            'expected_ppid',
            'status',
            'pid',
            'start_ticks',
            'executable',
            'stat_before',
            'stat_after',
        ]);
        if (
            receipt.schema_version !== 2 ||
            receipt.status !== 'observed' ||
            receipt.expected_ppid !== parent ||
            !Number.isSafeInteger(parent) ||
            parent < 2 ||
            receipt.pid === parent ||
            receipt.executable !== '/pilot/runtime-bin/codex'
        )
            throw new Error('projection_inner_child_ownership');
        const parser = new NativePilotRegistrationObservationValidator();
        const sample = (raw: any) => {
            projectionObject(raw, ['bytes', 'sha256', 'base64']);
            if (
                typeof raw.base64 !== 'string' ||
                !Number.isSafeInteger(raw.bytes) ||
                raw.bytes > 4096 ||
                raw.bytes < 1
            )
                throw new Error('projection_inner_child_stat');
            const bytes = Buffer.from(raw.base64, 'base64');
            if (
                bytes.toString('base64') !== raw.base64 ||
                bytes.length !== raw.bytes ||
                projectionDigest(bytes) !== raw.sha256
            )
                throw new Error('projection_inner_child_stat');
            const actual = parser.childStat(bytes, receipt.pid);
            const text = bytes.toString('utf8');
            const fields = text
                .slice(text.lastIndexOf(')') + 2)
                .trim()
                .split(/\s+/);
            if (
                !actual ||
                fields[1] !== String(parent) ||
                actual.start_ticks !== receipt.start_ticks
            )
                throw new Error('projection_inner_child_ownership');
            return actual;
        };
        const before = sample(receipt.stat_before),
            after = sample(receipt.stat_after);
        if (before.pid !== after.pid || before.start_ticks !== after.start_ticks)
            throw new Error('projection_inner_child_changed');
        return after;
    }

    private exit(value: unknown, pid: number) {
        const trace = projectionObject(value, ['schema_version', 'executable', 'events']);
        if (
            trace.schema_version !== 1 ||
            trace.executable !== '/pilot/runtime-bin/codex' ||
            !Array.isArray(trace.events) ||
            trace.events.length > 32
        )
            throw new Error('projection_inner_exit');
        let elapsed = -1;
        for (const event of trace.events) {
            projectionObject(event, [
                'event',
                'elapsed_ms',
                'pid',
                'signal',
                'exit_code',
                'timed_out',
                'output_truncated',
                'execution_error',
            ]);
            if (
                event.pid !== pid ||
                !Number.isSafeInteger(event.elapsed_ms) ||
                event.elapsed_ms < elapsed ||
                event.elapsed_ms > 40_500 ||
                event.timed_out !== false ||
                event.output_truncated !== false ||
                event.execution_error !== false
            )
                throw new Error('projection_inner_exit');
            elapsed = event.elapsed_ms;
        }
        const names = trace.events.map((event: any) => event.event);
        const terminal = trace.events.filter((event: any) => event.event === 'exit');
        const drained = trace.events.filter((event: any) => event.event === 'streams-closed');
        if (
            names[0] !== 'started' ||
            terminal.length !== 1 ||
            drained.length !== 1 ||
            terminal[0].exit_code !== 0 ||
            terminal[0].signal !== null ||
            drained[0].exit_code !== 0 ||
            drained[0].signal !== null ||
            names.indexOf('termination-requested') < 1 ||
            names.indexOf('stdin-eof-requested') < names.indexOf('termination-requested') ||
            names.indexOf('exit') <= names.indexOf('stdin-eof-requested') ||
            names.indexOf('streams-closed') <= names.indexOf('exit') ||
            names.some(
                (name: string) =>
                    ![
                        'started',
                        'termination-requested',
                        'stdin-eof-requested',
                        'signal-requested',
                        'exit',
                        'streams-closed',
                    ].includes(name),
            )
        )
            throw new Error('projection_inner_exit');
        return {
            kind: 'exit' as const,
            exitCode: 0,
            signal: null,
            timedOut: false,
            outputTruncated: false,
            terminationRequested: true,
        };
    }

    private frames(bytes: Buffer) {
        const codec = new CodexJsonlCodec();
        const frames = codec.push(bytes);
        codec.finish();
        return frames as any[];
    }

    validateAbsence(selected: NativePilotCodexAbsenceRetainedInput) {
        if (
            selected.report?.status !== 'observed' ||
            selected.report.native_acceptance !== false ||
            selected.report.observation?.scope !== 'native-owned-absence-no-thread-no-turn'
        )
            throw new Error('projection_absence_incomplete');
        const actual = selected.report.observation;
        const observations = projectionObject(selected.identity, ['schema_version', 'processes']);
        if (
            observations.schema_version !== 1 ||
            !Array.isArray(observations.processes) ||
            observations.processes.length !== 1
        )
            throw new Error('projection_inner_process');
        const process = projectionObject(observations.processes[0], [
            'executable',
            'argv',
            'cwd',
            'identity',
        ]);
        const child = this.child(process.identity, selected.outer_pid);
        if (
            process.executable !== '/pilot/runtime-bin/codex' ||
            process.cwd !== '/pilot/consumer' ||
            JSON.stringify(child) !== JSON.stringify(actual.process_identity) ||
            JSON.stringify(process.argv) !==
                JSON.stringify(NativeCodexConfiguration.argv(actual.fixture_base_url))
        )
            throw new Error('projection_inner_process');
        this.exit(selected.events, child.pid);
        const metadata = projectionObject(selected.fixture_metadata, [
            'schema_version',
            'request_count',
            'exchanges',
        ]);
        if (
            metadata.schema_version !== 2 ||
            metadata.request_count !== 0 ||
            !Array.isArray(metadata.exchanges) ||
            metadata.exchanges.length ||
            selected.fixture_request.length ||
            selected.fixture_response.length
        )
            throw new Error('projection_absence_http_request');
        const recipe = new NativeCodexAbsenceObservationService(this.protocol);
        const requests = this.frames(selected.request);
        if (JSON.stringify(requests) !== JSON.stringify(recipe.requests()))
            throw new Error('projection_absence_request');
        const wanted = recipe.requests().filter((row) => row.method !== 'initialized');
        const results = [],
            notifications = [];
        let response = 0;
        for (const frame of this.frames(selected.stdout)) {
            if (Object.hasOwn(frame, 'method')) {
                projectionObject(
                    frame,
                    Object.hasOwn(frame, 'emittedAtMs')
                        ? ['method', 'params', 'emittedAtMs']
                        : ['method', 'params'],
                );
                if (
                    typeof frame.method !== 'string' ||
                    (Object.hasOwn(frame, 'emittedAtMs') &&
                        (!Number.isSafeInteger(frame.emittedAtMs) || frame.emittedAtMs < 0))
                )
                    throw new Error('projection_absence_notification_envelope');
                this.protocol.notification(frame.method, frame.params);
                if (notifications.length >= 256)
                    throw new Error('projection_absence_notification_bound');
                notifications.push(frame);
                continue;
            }
            projectionObject(frame, ['id', 'result']);
            const request = wanted[response++];
            if (!request || frame.id !== request.id) throw new Error('projection_absence_response');
            this.protocol.response(request.method as any, frame.result);
            results.push(frame.result);
        }
        const diagnostic = new NativeCodexDiagnosticValidator();
        diagnostic.push(selected.stderr);
        diagnostic.finish();
        const derived = recipe.derive(
            selected.input,
            results,
            notifications,
            child,
            actual.fixture_base_url,
            diagnostic.observed(),
        );
        if (JSON.stringify(derived) !== JSON.stringify(actual))
            throw new Error('projection_absence_semantics');
        return derived;
    }

    private installed(
        actual: ArtifactInventory,
        root: string,
        source: ArtifactInventory,
        home: Map<string, NativePilotExportEntry>,
    ) {
        if (root === '/pilot/source') return source;
        const normalHome = posix.join('/', 'home', 'node');
        if (
            !root.startsWith(`${normalHome}/.codex/plugins/cache/`) ||
            posix.normalize(root) !== root
        )
            throw new Error('projection_loaded_root');
        const prefix = root.slice(normalHome.length + 1) + '/';
        const retained = [...home.values()].filter((entry) => entry.path.startsWith(prefix));
        if (
            !Array.isArray(actual.entries) ||
            retained.length !== actual.entries.length ||
            projectionDigest(JSON.stringify(actual.entries)) !== actual.tree_sha256
        )
            throw new Error('projection_loaded_inventory');
        for (const expected of actual.entries) {
            if (!projectionPath(expected.path)) throw new Error('projection_loaded_inventory');
            const measured = home.get(prefix + expected.path);
            if (
                !measured ||
                measured.kind !== expected.kind ||
                measured.bytes !== expected.bytes ||
                measured.sha256 !== expected.sha256 ||
                measured.target !== expected.target
            )
                throw new Error('projection_loaded_bytes');
        }
        // Executable bits come from the retained native inventory; worker export proves
        // every path/kind/byte/hash/target, and does not independently measure modes.
        return actual;
    }

    async validate(selected: NativePilotCodexRetainedInput): Promise<any> {
        if (
            selected.report?.status !== 'observed' ||
            selected.report.native_acceptance !== false ||
            selected.report.observation?.result !== 'observed'
        )
            throw new Error('projection_native_observation_incomplete');
        const actual = selected.report.observation;
        const observations = projectionObject(selected.identity, ['schema_version', 'processes']);
        if (
            observations.schema_version !== 1 ||
            !Array.isArray(observations.processes) ||
            observations.processes.length !== 1
        )
            throw new Error('projection_inner_process');
        const process = projectionObject(observations.processes[0], [
            'executable',
            'argv',
            'cwd',
            'identity',
        ]);
        const child = this.child(process.identity, selected.outer_pid);
        if (
            JSON.stringify(child) !== JSON.stringify(actual.process_identity) ||
            process.executable !== '/pilot/runtime-bin/codex' ||
            process.cwd !== '/pilot/consumer'
        )
            throw new Error('projection_inner_process');
        const exit = this.exit(selected.events, child.pid);
        const metadata = projectionObject(selected.fixture_metadata, [
            'schema_version',
            'request_count',
            'exchanges',
        ]);
        if (
            metadata.schema_version !== 2 ||
            metadata.request_count !== 1 ||
            !Array.isArray(metadata.exchanges) ||
            metadata.exchanges.length !== 1
        )
            throw new Error('projection_fixture_metadata');
        const exchange = projectionObject(metadata.exchanges[0], [
            'method',
            'path',
            'raw_headers',
            'request_sha256',
            'request_bytes',
            'status',
            'response_headers',
            'response_sha256',
            'response_bytes',
        ]);
        if (
            exchange.method !== 'POST' ||
            exchange.path !== '/v1/responses' ||
            exchange.status !== 200 ||
            exchange.request_sha256 !== projectionDigest(selected.fixture_request) ||
            exchange.request_bytes !== selected.fixture_request.length ||
            exchange.response_sha256 !== projectionDigest(selected.fixture_response) ||
            exchange.response_bytes !== selected.fixture_response.length ||
            !Array.isArray(exchange.raw_headers) ||
            exchange.raw_headers.length > 128 ||
            exchange.raw_headers.length % 2 ||
            exchange.raw_headers.some(
                (part: unknown) => typeof part !== 'string' || Buffer.byteLength(part) > 4096,
            )
        )
            throw new Error('projection_fixture_metadata');
        const headers: Record<string, string> = {};
        for (let i = 0; i < exchange.raw_headers.length; i += 2) {
            const key = exchange.raw_headers[i].toLowerCase();
            if (
                Object.hasOwn(headers, key) ||
                /(?:authorization|cookie|api[-_]?key|proxy|token)/i.test(key)
            )
                throw new Error('projection_fixture_headers');
            headers[key] = exchange.raw_headers[i + 1];
        }
        const baseArg = process.argv.find(
            (arg: unknown) =>
                typeof arg === 'string' && arg.startsWith('model_providers.native_pilot.base_url='),
        );
        if (typeof baseArg !== 'string') throw new Error('projection_fixed_inner_argv');
        const baseUrl = JSON.parse(baseArg.slice(baseArg.indexOf('=') + 1));
        if (JSON.stringify(process.argv) !== JSON.stringify(NativeCodexConfiguration.argv(baseUrl)))
            throw new Error('projection_fixed_inner_argv');
        const installed = this.installed(
            actual.installed_artifact_inventory,
            actual.plugin_root,
            selected.input.artifactInventory,
            selected.home,
        );
        const requests = this.frames(selected.request),
            frames = this.frames(selected.stdout);
        const queue: ProcessEvent[] = [];
        let wake: (() => void) | undefined;
        let requestAt = 0,
            frameAt = 0,
            closed = false,
            fixtureHandled = false;
        let handle: ((request: any) => any) | undefined;
        const enqueue = (event: ProcessEvent) => {
            queue.push(event);
            wake?.();
            wake = undefined;
        };
        const deliver = (id: number | undefined) => {
            while (frameAt < frames.length) {
                const frame = frames[frameAt];
                if (Object.hasOwn(frame, 'id') && frame.id !== id) break;
                frameAt++;
                enqueue({ kind: 'bytes', stream: 'stdout', bytes: CodexJsonlCodec.encode(frame) });
                if (Object.hasOwn(frame, 'id')) {
                    while (frameAt < frames.length && !Object.hasOwn(frames[frameAt], 'id'))
                        enqueue({
                            kind: 'bytes',
                            stream: 'stdout',
                            bytes: CodexJsonlCodec.encode(frames[frameAt++]),
                        });
                    break;
                }
            }
        };
        const confinement: ObserverConfinement = {
            evidenceKind: 'confined_native',
            fixture: {
                start: async (handler) => {
                    handle = handler;
                    return {
                        baseUrl,
                        close: async () => {
                            if (
                                !fixtureHandled ||
                                !closed ||
                                requestAt !== requests.length ||
                                frameAt !== frames.length
                            )
                                throw new Error('projection_transcript_incomplete');
                        },
                    };
                },
            },
            start: async (argv) => {
                if (JSON.stringify(argv) !== JSON.stringify(process.argv))
                    throw new Error('projection_fixed_inner_argv');
                if (selected.stderr.length)
                    enqueue({ kind: 'bytes', stream: 'stderr', bytes: selected.stderr });
                return {
                    identity: child,
                    write: async (bytes) => {
                        const request = CodexJsonlCodec.json(bytes);
                        if (JSON.stringify(request) !== JSON.stringify(requests[requestAt++]))
                            throw new Error('projection_transcript_request');
                        if ((request as any).method === 'turn/start') {
                            if (!handle || fixtureHandled)
                                throw new Error('projection_fixture_count');
                            const response = handle({
                                method: exchange.method,
                                path: exchange.path,
                                headers,
                                body: selected.fixture_request,
                            });
                            if (
                                response.status !== exchange.status ||
                                JSON.stringify(response.headers) !==
                                    JSON.stringify(exchange.response_headers) ||
                                !Buffer.from(response.body).equals(selected.fixture_response)
                            )
                                throw new Error('projection_fixture_response');
                            fixtureHandled = true;
                        }
                        deliver((request as any).id);
                    },
                    events: async function* () {
                        for (;;) {
                            while (queue.length) {
                                const event = queue.shift()!;
                                yield event;
                                if (event.kind === 'exit') return;
                            }
                            if (closed) return;
                            await new Promise<void>((resolve) => {
                                wake = resolve;
                            });
                        }
                    },
                    terminate: async () => {
                        closed = true;
                        enqueue(exit);
                        return { exited: true };
                    },
                };
            },
            artifact: async (root) => {
                if (root !== actual.plugin_root) throw new Error('projection_loaded_root');
                return installed;
            },
            fingerprint: async (root) => {
                const prefix = posix.relative(actual.plugin_root, root) + '/';
                if (!projectionPath(prefix.slice(0, -1)))
                    throw new Error('projection_loaded_package');
                const rows = installed.entries.filter((entry) => entry.path.startsWith(prefix));
                if (rows.some((entry) => entry.kind === 'symlink'))
                    throw new Error('projection_loaded_package');
                return rows
                    .filter((entry) => entry.kind === 'file')
                    .map((entry) => ({
                        path: entry.path.slice(prefix.length),
                        sha256: entry.sha256!,
                        bytes: entry.bytes,
                    }));
            },
            captureState: async (label) => {
                const index = label === 'mcp-before' ? 0 : 1;
                const state = selected.states[index];
                if (!state) throw new Error('projection_mcp_state_missing');
                return state;
            },
        };
        const derived = await new NativeCodexObservationService(this.protocol).observe(
            selected.input,
            confinement,
        );
        if (JSON.stringify(derived) !== JSON.stringify(actual))
            throw new Error('projection_semantic_observation_mismatch');
        return derived;
    }
}
