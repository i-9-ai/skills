import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NativePilotRegistrationObservationValidator } from '../../../src/validator/NativePilotRegistrationObservationValidator.ts';

const validator = new NativePilotRegistrationObservationValidator();
const json = (value) => Buffer.from(JSON.stringify(value) + '\n');
function records(host = 'codex') {
    const recipes = [
        ['native-auth-status', host === 'codex' ? ['login', 'status'] : ['auth', 'status']],
        [
            'native-plugin-list',
            host === 'codex'
                ? ['plugin', 'list', '--marketplace', 'i9-skills', '--json']
                : ['plugin', 'list', '--json'],
        ],
        ['native-marketplace-list', ['plugin', 'marketplace', 'list', '--json']],
    ];
    return recipes.map(([label, argv], index) => ({
        label,
        argv,
        executable: `/pilot/runtime-bin/${host}`,
        process: { status: 'completed', exit_code: index === 0 ? 1 : 0, signal: null },
        pid: 90 + index,
        start_ticks: String(100 + index),
        stdout:
            index === 0
                ? host === 'codex'
                    ? Buffer.alloc(0)
                    : json({
                          loggedIn: false,
                          authMethod: 'none',
                          configDirectory: join('/', 'home', 'node', '.claude'),
                      })
                : host === 'claude'
                  ? json([])
                  : index === 1
                    ? json({ installed: [], available: [] })
                    : json({ marketplaces: [] }),
        stderr: index === 0 && host === 'codex' ? Buffer.from('Not logged in\n') : Buffer.alloc(0),
    }));
}
for (const host of ['codex', 'claude'])
    test(`${host} documented empty registries and unauthenticated status are separate from native hook/MCP proof`, () => {
        for (const phase of ['baseline', 'verify-absent']) {
            const actual = validator.validate(host, phase, records(host));
            assert.equal(actual.unauthenticated, true);
            assert.equal(actual.owned_plugin_and_marketplace_absent, true);
            assert.equal(actual.fresh_native_process, true);
            assert.equal(actual.owned_hooks_and_mcp_absent, false);
        }
    });

test('auth exit one without exact native status bytes cannot establish absence', () => {
    for (const mutate of [
        (r) => {
            r[0].stderr = Buffer.from('Error checking login status: synthetic\n');
        },
        (r) => {
            r[0].stdout = Buffer.from('Not logged in\n');
            r[0].stderr = Buffer.alloc(0);
        },
        (r) => {
            r[0].process.exit_code = 0;
        },
        (r) => {
            r[0].process.status = 'timeout';
        },
        (r) => {
            r[0].process.signal = 'SIGKILL';
        },
    ]) {
        const r = records();
        mutate(r);
        const result = validator.validate('codex', 'baseline', r);
        assert.equal(result.unauthenticated, false);
        assert.equal(result.owned_plugin_and_marketplace_absent, false);
    }
});

test('Claude auth uses the measured recipe normal config directory and explicit no-auth method', () => {
    for (const value of [
        { loggedIn: false, authMethod: 'api_key' },
        { loggedIn: true, authMethod: 'none' },
        { loggedIn: false, authMethod: 'none', configDirectory: '/unrelated/profile' },
    ]) {
        const r = records('claude');
        r[0].stdout = json(value);
        assert.equal(validator.validate('claude', 'baseline', r).unauthenticated, false);
    }
});

test('unknown nonempty registries, shapes, diagnostics, duplicate or missing calls stay blocked', () => {
    for (const mutate of [
        (r) => {
            r[1].stdout = json({ installed: [{ pluginId: 'i9-skills@i9-skills' }], available: [] });
        },
        (r) => {
            r[2].stdout = json({ marketplaces: [{ name: 'i9-skills', root: '/pilot/source' }] });
        },
        (r) => {
            r[1].stdout = json({ installed: [], available: [], errors: ['synthetic'] });
        },
        (r) => {
            r[2].stdout = json([]);
        },
        (r) => {
            r[2].stderr = Buffer.from('Warning: synthetic unsupported diagnostic\n');
        },
        (r) => {
            r[2].process.exit_code = 1;
        },
        (r) => {
            r.pop();
        },
        (r) => {
            r[2] = r[1];
        },
    ]) {
        const r = records();
        mutate(r);
        assert.equal(
            validator.validate('codex', 'baseline', r).owned_plugin_and_marketplace_absent,
            false,
        );
    }
});

test('the fixed selected marketplace filter and executable cannot be replaced by caller argv', () => {
    for (const mutate of [
        (r) => {
            r[1].argv = ['plugin', 'list', '--json'];
        },
        (r) => {
            r[0].executable = '/bin/sh';
        },
        (r) => {
            r[2].argv.push('--available');
        },
    ]) {
        const r = records();
        mutate(r);
        const result = validator.validate('codex', 'baseline', r);
        assert.equal(result.unauthenticated, false);
        assert.equal(result.owned_plugin_and_marketplace_absent, false);
    }
});

test('missing or replayed child identities cannot establish a fresh native process', () => {
    for (const mutate of [
        (r) => {
            r[0].start_ticks = null;
        },
        (r) => {
            r[0].pid = null;
        },
        (r) => {
            r[1].pid = r[0].pid;
            r[1].start_ticks = r[0].start_ticks;
        },
    ]) {
        const r = records();
        mutate(r);
        const result = validator.validate('codex', 'verify-absent', r);
        assert.equal(result.fresh_native_process, false);
        assert.equal(result.owned_plugin_and_marketplace_absent, true);
    }
});

test('malformed UTF8, oversized output and embedded NUL are retained inputs, never registry proof', () => {
    for (const bytes of [Buffer.from([255]), Buffer.alloc(1048577, 65), Buffer.from('[\u0000]')]) {
        const r = records('claude');
        r[1].stdout = bytes;
        assert.equal(
            validator.validate('claude', 'baseline', r).owned_plugin_and_marketplace_absent,
            false,
        );
    }
});

const identity = (state = 'S', parent = 71, ticks = '12345') => {
    const raw = Buffer.from(
        `90 (synthetic ) process) ${state} ${Array.from({ length: 49 }, (_, i) => (i === 0 ? String(parent) : i === 18 ? ticks : '0')).join(' ')}\n`,
    );
    return {
        schema_version: 2,
        status: 'observed',
        pid: 90,
        observer_pid: 71,
        start_ticks: '12345',
        executable: '/pilot/runtime-bin/codex',
        stat_before: {
            bytes: raw.length,
            sha256: createHash('sha256').update(raw).digest('hex'),
            base64: raw.toString('base64'),
        },
        stat_after: validator.childStatReceipt(raw),
    };
};
test('child identity codec binds exact raw stat bytes and handles parentheses in the command name', () => {
    assert.deepEqual(validator.childIdentity(identity(), '/pilot/runtime-bin/codex', 71), {
        pid: 90,
        start_ticks: '12345',
    });
});
test('changed identity hashes, process time, executable, unknown state and zombie never become observed fresh process', () => {
    for (const mutate of [
        (v) => {
            v.stat_before.sha256 = 'a'.repeat(64);
        },
        (v) => {
            v.stat_before.bytes++;
        },
        (v) => {
            v.stat_before.base64 += '\n';
        },
        (v) => {
            v.pid = 91;
        },
        (v) => {
            v.start_ticks = '54321';
        },
        (v) => {
            v.executable = '/unselected/binary';
        },
        (v) => {
            v.status = 'unavailable';
        },
        (v) => {
            v.extra = 'unsupported';
        },
    ]) {
        const v = identity();
        mutate(v);
        assert.equal(validator.childIdentity(v, '/pilot/runtime-bin/codex', 71), null);
    }
    for (const state of ['Z', 'X', '?'])
        assert.equal(
            validator.childIdentity(identity(state), '/pilot/runtime-bin/codex', 71),
            null,
        );
});

test('v2 ownership requires a separately measured parent and two bound live samples', () => {
    for (const parent of [undefined, null, 1, 72, 71.5, NaN, Infinity])
        assert.equal(validator.childIdentity(identity(), '/pilot/runtime-bin/codex', parent), null);
    for (const [name, mutate] of [
        [
            'legacy single sample',
            (v) => {
                v.schema_version = 1;
                v.stat = v.stat_before;
                delete v.stat_before;
                delete v.stat_after;
                delete v.observer_pid;
            },
        ],
        [
            'self asserted foreign parent',
            (v) => {
                v.observer_pid = 1;
                v.stat_before = identity('S', 1).stat_before;
                v.stat_after = identity('S', 1).stat_after;
            },
        ],
        [
            'foreign second parent',
            (v) => {
                v.stat_after = identity('S', 72).stat_after;
            },
        ],
        [
            'second start race',
            (v) => {
                v.stat_after = identity('S', 71, '12346').stat_after;
            },
        ],
        [
            'zombie second sample',
            (v) => {
                v.stat_after = identity('Z').stat_after;
            },
        ],
        [
            'unknown second sample with correct hash',
            (v) => {
                v.stat_after = validator.childStatReceipt(Buffer.from('unknown'));
            },
        ],
        [
            'absent second sample',
            (v) => {
                v.stat_after = null;
            },
        ],
        [
            'corrupt second digest',
            (v) => {
                v.stat_after.sha256 = 'f'.repeat(64);
            },
        ],
        [
            'second bound overflow',
            (v) => {
                v.stat_after.bytes = 4097;
            },
        ],
        [
            'second base64 overflow',
            (v) => {
                v.stat_after.base64 = 'a'.repeat(5465);
            },
        ],
        [
            'same child and parent',
            (v) => {
                v.pid = 71;
            },
        ],
    ]) {
        const value = identity();
        mutate(value);
        assert.equal(validator.childIdentity(value, '/pilot/runtime-bin/codex', 71), null, name);
    }
});

test('retention bound rejects oversized bytes and the existing two-argument stat parser stays compatible', () => {
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(4097)])
        assert.throws(() => validator.childStatReceipt(bytes), /stat_bound/);
    const raw = Buffer.from(identity().stat_before.base64, 'base64');
    assert.deepEqual(validator.childStat(raw, 90), { pid: 90, start_ticks: '12345' });
    assert.deepEqual(validator.childStat(raw, 90, 71), { pid: 90, start_ticks: '12345' });
    assert.equal(validator.childStat(raw, 90, 72), null);
});
