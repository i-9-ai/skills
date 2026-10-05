// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { input, fakeRun, fixtureRequest, validator } from './NativeCodexTranscriptFixture.mjs';
import { NativeCodexObservationService } from '../../src/service/NativeCodexObservationService.ts';

import { NativePilotStateSnapshotRepository } from '../../src/repository/NativePilotStateSnapshotRepository.ts';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(count = 51, changeSelected = (selected) => {}) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'i9-native-state-fixture-'));
    const home = join(root, 'home'),
        output = join(root, 'output');
    mkdirSync(home);
    mkdirSync(output);
    const stateRepo = new NativePilotStateSnapshotRepository({ home, outputRoot: output });
    stateRepo.seed('8a7d0a7e-b672-478c-bb12-03a1a81d3e98');
    const before = stateRepo.snapshot('mcp-before'),
        after = stateRepo.snapshot('mcp-after');
    const states = [
        {
            snapshot: before,
            artifacts: stateRepo.artifacts('mcp-before').map((row) => ({
                ...row,
                role: row.path.endsWith('-state.json') ? 'state-before-mcp' : 'state-bytes',
            })),
        },
        {
            snapshot: after,
            artifacts: stateRepo.artifacts('mcp-after').map((row) => ({
                ...row,
                role: row.path.endsWith('-state.json') ? 'state-after-mcp' : 'state-bytes',
            })),
        },
    ];
    const selected = input(count);
    changeSelected(selected);
    const f = fakeRun(selected);
    const identity = { pid: 50123, start_ticks: '12345' };
    f.process.identity = identity;
    f.confinement.evidenceKind = 'confined_native';
    f.confinement.captureState = async (label) => states[label === 'mcp-before' ? 0 : 1];
    const observation = await new NativeCodexObservationService(validator).observe(
        selected,
        f.confinement,
    );
    const stat = Buffer.from(
        '50123 (synthetic codex) S ' +
            ['100', ...Array(17).fill('0'), '12345', '0'].join(' ') +
            '\n',
    );
    const retained = { bytes: stat.length, sha256: sha(stat), base64: stat.toString('base64') };
    const request = fixtureRequest(),
        response = f.state.response;
    const fields = {
        elapsed_ms: 0,
        pid: 50123,
        signal: null,
        exit_code: null,
        timed_out: false,
        output_truncated: false,
        execution_error: false,
    };
    return {
        root,
        selected: {
            input: selected,
            report: { status: 'observed', native_acceptance: false, observation },
            identity: {
                schema_version: 1,
                processes: [
                    {
                        executable: '/pilot/runtime-bin/codex',
                        argv: f.state.argv,
                        cwd: '/pilot/consumer',
                        identity: {
                            schema_version: 2,
                            expected_ppid: 100,
                            status: 'observed',
                            pid: 50123,
                            start_ticks: '12345',
                            executable: '/pilot/runtime-bin/codex',
                            stat_before: retained,
                            stat_after: retained,
                        },
                    },
                ],
            },
            events: {
                schema_version: 1,
                executable: '/pilot/runtime-bin/codex',
                events: [
                    'started',
                    'termination-requested',
                    'stdin-eof-requested',
                    'exit',
                    'streams-closed',
                ].map((event, index) => ({
                    ...fields,
                    event,
                    elapsed_ms: index,
                    exit_code: ['exit', 'streams-closed'].includes(event) ? 0 : null,
                })),
            },
            outer_pid: 100,
            request: Buffer.from(f.state.calls.map((row) => JSON.stringify(row) + '\n').join('')),
            stdout: Buffer.concat(f.state.stdout),
            stderr: Buffer.alloc(0),
            fixture_request: request.body,
            fixture_response: response.body,
            fixture_metadata: {
                schema_version: 2,
                request_count: 1,
                exchanges: [
                    {
                        method: request.method,
                        path: request.path,
                        raw_headers: ['Content-Type', 'application/json'],
                        request_sha256: sha(request.body),
                        request_bytes: request.body.length,
                        status: response.status,
                        response_headers: response.headers,
                        response_sha256: sha(response.body),
                        response_bytes: response.body.length,
                    },
                ],
            },
            home: new Map(),
            states,
        },
        remove: () => rmSync(root, { recursive: true, force: true }),
    };
}

export { fixture };
