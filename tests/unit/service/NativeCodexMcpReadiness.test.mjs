// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { input, fakeRun, validator } from '../../helpers/NativeCodexTranscriptFixture.mjs';
import { fixture } from '../../helpers/NativeCodexMeasuredFixture.mjs';
import { NativeCodexObservationService } from '../../../src/service/NativeCodexObservationService.ts';
import { NativePilotCodexObservationService } from '../../../src/service/NativePilotCodexObservationService.ts';

function clock() {
    return {
        elapsed: 0,
        waits: [],
        now() {
            return this.elapsed;
        },
        async wait(milliseconds) {
            this.waits.push(milliseconds);
            this.elapsed += milliseconds;
        },
    };
}

function statusCalls(state) {
    return state.calls.filter((call) => call.method === 'mcpServerStatus/list');
}

async function rejected(mutate, reason, { count = 1, timing = clock(), setup } = {}) {
    const f = fakeRun(input(count), (request, result, state, emit) =>
        mutate(request, result, state, timing, emit),
    );
    setup?.(f, timing);
    await assert.rejects(
        new NativeCodexObservationService(validator, timing).observe(input(count), f.confinement),
        reason,
    );
    assert.equal(
        f.state.calls.some((call) => ['mcpServer/tool/call', 'turn/start'].includes(call.method)),
        false,
    );
    assert.equal(f.state.response, undefined);
    assert.equal(f.state.closed, 1);
    assert.equal(f.state.fixtureClosed, 1);
    return { state: f.state, timing };
}

test('already connected keeps the single status observation and unchanged later recipe', async () => {
    const f = fakeRun();
    const timing = clock();
    const observed = await new NativeCodexObservationService(validator, timing).observe(
        input(),
        f.confinement,
    );
    assert.equal(statusCalls(f.state).length, 1);
    assert.deepEqual(timing.waits, []);
    assert.equal(observed.mcp.status, 'connected');
    assert.equal(observed.session_start.fixture.requests, 1);
});

test('only starting waits for a complete new connected inventory before tools or turn', async () => {
    const timing = clock();
    const f = fakeRun(input(), (request, result, state) => {
        if (request.method !== 'mcpServerStatus/list') return;
        assert.equal(
            state.calls.some((call) => ['mcpServer/tool/call', 'turn/start'].includes(call.method)),
            false,
        );
        if (statusCalls(state).length < 3) {
            result.data[0].runtimeStatus = 'starting';
            result.data[0].tools = {};
        }
    });
    const observed = await new NativeCodexObservationService(validator, timing).observe(
        input(),
        f.confinement,
    );
    assert.equal(statusCalls(f.state).length, 3);
    assert.deepEqual(timing.waits, [100, 100]);
    assert.equal(observed.mcp.status, 'connected');
    assert.equal(observed.session_start.fixture.requests, 1);
});

test('every readiness observation finishes all pages and strict static replay consumes the same extended transcript', async () => {
    const timing = clock();
    const f = await fixture(
        51,
        () => {},
        (request, result, state) => {
            if (request.method !== 'mcpServerStatus/list') return;
            const number = statusCalls(state).length;
            if (request.params.cursor === null) {
                result.data[0].name = 'synthetic-other-server';
                result.data[0].pluginId = null;
                result.nextCursor = 'synthetic-page-two';
            } else {
                assert.equal(request.params.cursor, 'synthetic-page-two');
                result.data[0].runtimeStatus = number === 2 ? 'starting' : 'connected';
            }
        },
        timing,
    );
    try {
        const requests = f.selected.request.toString().trim().split('\n').map(JSON.parse);
        assert.deepEqual(
            requests
                .filter((row) => row.method === 'mcpServerStatus/list')
                .map((row) => row.params.cursor),
            [null, 'synthetic-page-two', null, 'synthetic-page-two'],
        );
        const observed = await new NativePilotCodexObservationService(validator).validate(
            f.selected,
        );
        assert.equal(observed.mcp.status, 'connected');
        assert.equal(observed.mcp.catalog_count, 51);
        assert.equal(observed.read_only_mcp.branch, 'existing_unchanged');
        assert.equal(observed.session_start.fixture.requests, 1);
        const altered = structuredClone(f.selected);
        const frames = Buffer.from(altered.stdout).toString().trim().split('\n').map(JSON.parse);
        const finalStatus = requests.filter((row) => row.method === 'mcpServerStatus/list').at(-1);
        frames.find((row) => row.id === finalStatus.id).result.data[0].runtimeStatus = 'starting';
        altered.stdout = Buffer.from(frames.map((row) => JSON.stringify(row) + '\n').join(''));
        await assert.rejects(new NativePilotCodexObservationService(validator).validate(altered));
    } finally {
        f.remove();
    }
});

test('forty-eight status queries leave the complete 256-skill recipe inside the existing sixty-four RPC bound', async () => {
    const selected = input(256),
        timing = clock();
    const f = fakeRun(selected, (request, result, state) => {
        if (request.method === 'mcpServerStatus/list' && statusCalls(state).length < 48)
            result.data[0].runtimeStatus = 'starting';
    });
    const observed = await new NativeCodexObservationService(validator, timing).observe(
        selected,
        f.confinement,
    );
    assert.equal(statusCalls(f.state).length, 48);
    assert.equal(f.state.calls.filter((row) => row.id !== undefined).length, 63);
    assert.equal(observed.mcp.catalog_count, 256);
    assert.equal(observed.session_start.fixture.requests, 1);
});

test('permanent starting exhausts finite queries without a tool, turn or fixture exchange', async () => {
    const f = await rejected((request, result) => {
        if (request.method === 'mcpServerStatus/list') result.data[0].runtimeStatus = 'starting';
    }, /native_mcp_readiness_bound/);
    assert.equal(statusCalls(f.state).length, 48);
    assert.equal(f.timing.waits.length, 47);
});

test('terminal, absent and unknown states never get a readiness retry', async (t) => {
    for (const state of [
        'notStarted',
        'failed',
        'cancelled',
        'disabled',
        'authenticationRequired',
        null,
        undefined,
        'unrecognized',
    ])
        await t.test(String(state), async () => {
            const f = await rejected((request, result) => {
                if (request.method === 'mcpServerStatus/list') result.data[0].runtimeStatus = state;
            }, /native_mcp_status|schema_mismatch/);
            assert.equal(statusCalls(f.state).length, 1);
            assert.deepEqual(f.timing.waits, []);
        });
});

test('discovery errors, HTTP origins, auth, and final missing tools refuse both transient and connected status', async (t) => {
    for (const [label, change] of [
        [
            'discovery error',
            (row) => {
                row.toolsError = 'synthetic discovery failure';
            },
        ],
        [
            'empty discovery error',
            (row) => {
                row.toolsError = '';
            },
        ],
        [
            'HTTP origin',
            (row) => {
                row.httpOrigin = 'https://example.invalid';
            },
        ],
        [
            'empty HTTP origin',
            (row) => {
                row.httpOrigin = '';
            },
        ],
        [
            'auth',
            (row) => {
                row.authStatus = 'bearerToken';
            },
        ],
        [
            'missing final tools',
            (row) => {
                row.tools = {};
            },
        ],
    ])
        for (const status of label === 'missing final tools'
            ? ['connected']
            : ['starting', 'connected'])
            await t.test(label + ' ' + status, async () => {
                await rejected((request, result) => {
                    if (request.method !== 'mcpServerStatus/list') return;
                    result.data[0].runtimeStatus = status;
                    change(result.data[0]);
                }, /native_mcp_status/);
            });
});

test('changed, missing or duplicate selected identities and repeated page records are refused', async (t) => {
    for (const [label, change] of [
        [
            'changed name',
            (result) => {
                result.data[0].name = 'synthetic-changed-server';
            },
        ],
        [
            'changed plugin',
            (result) => {
                result.data[0].pluginId = 'synthetic-other@synthetic-other';
            },
        ],
        [
            'missing selected',
            (result) => {
                result.data = [];
            },
        ],
        [
            'duplicate selected',
            (result) => {
                result.data.push({ ...result.data[0], name: 'second-selected' });
            },
        ],
        [
            'duplicate page name',
            (result) => {
                result.data.push({ ...result.data[0], pluginId: null });
            },
        ],
    ])
        await t.test(label, async () => {
            await rejected((request, result, state) => {
                if (request.method !== 'mcpServerStatus/list') return;
                if (statusCalls(state).length === 1) result.data[0].runtimeStatus = 'starting';
                else change(result);
            }, /native_mcp_inventory|native_mcp_identity_changed/);
        });
});

test('cursor cycles, mixed duplicate pages, row/page bounds and stale response IDs remain blocked', async (t) => {
    for (const [label, mutate, reason] of [
        [
            'cursor cycle',
            (request, result) => {
                result.data = [];
                result.nextCursor = 'same-cursor';
            },
            /native_mcp_paging/,
        ],
        [
            'duplicate across pages',
            (request, result) => {
                result.nextCursor = request.params.cursor === null ? 'next-page' : null;
            },
            /native_mcp_inventory/,
        ],
        [
            'page bound',
            (request, result, state) => {
                result.data = [];
                result.nextCursor = 'page-' + statusCalls(state).length;
            },
            /native_mcp_paging/,
        ],
        [
            'row bound',
            (request, result) => {
                result.data = Array.from({ length: 257 }, (_, index) => ({
                    ...result.data[0],
                    name: 'server-' + index,
                }));
            },
            /native_mcp_bound/,
        ],
        [
            'stale response',
            (request, result, state, timing, emit) => {
                emit({ id: request.id - 1, result });
            },
            /unexpected_rpc_response/,
        ],
    ])
        await t.test(label, async () => {
            await rejected((request, result, state, timing, emit) => {
                if (request.method === 'mcpServerStatus/list')
                    mutate(request, result, state, timing, emit);
            }, reason);
        });
});

test('setup, in-flight responses and bounded waits cannot move readiness beyond the same native deadline', async (t) => {
    await t.test('native setup consumes existing lifetime', async () => {
        const f = await rejected(() => {}, /native_mcp_readiness_deadline/, {
            setup(f, timing) {
                const start = f.confinement.start;
                f.confinement.start = async (argv) => {
                    timing.elapsed = 40_000;
                    return start(argv);
                };
            },
        });
        assert.equal(statusCalls(f.state).length, 0);
    });
    await t.test('connected response arrives at deadline', async () => {
        await rejected((request, result, state, timing) => {
            if (request.method === 'mcpServerStatus/list') timing.elapsed = 40_000;
        }, /native_mcp_readiness_deadline/);
    });
    await t.test('last wait is clamped to remaining lifetime', async () => {
        const f = await rejected((request, result, state, timing) => {
            if (request.method !== 'mcpServerStatus/list') return;
            result.data[0].runtimeStatus = 'starting';
            timing.elapsed = 39_950;
        }, /native_mcp_readiness_deadline/);
        assert.deepEqual(f.timing.waits, [50]);
        assert.equal(statusCalls(f.state).length, 1);
    });
});
