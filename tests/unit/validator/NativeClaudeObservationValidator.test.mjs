// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import { NativeClaudeRawConfiguration } from '../../../src/config/NativeClaudeRawConfiguration.ts';
import { NativeClaudeObservationValidator } from '../../../src/validator/NativeClaudeObservationValidator.ts';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (value) => Buffer.from(JSON.stringify(value) + '\n');
const home = join('/', 'home', 'node');
const runId = 'b0b3693a-f914-4286-a5da-9fe48e6a72bb';
const auth = {
    loggedIn: false,
    authMethod: 'none',
    apiProvider: 'firstParty',
    analyticsDisabled: false,
    projectsDirectory: join(home, '.claude', 'projects'),
    configDirectory: join(home, '.claude'),
};
const mcp = 'plugin:i9-skills:i9-skills';
const manifest = {
    name: 'i9-skills',
    version: '0.3.4',
    skills: './.agents/skills/',
    hooks: './hooks/claude.json',
    mcpServers: './mcp/claude.json',
};
const hookManifest = {
    hooks: {
        SessionStart: [
            {
                matcher: 'startup|resume|clear|compact',
                hooks: [
                    {
                        type: 'command',
                        command: 'node',
                        args: [
                            '${CLAUDE_PLUGIN_ROOT}/src/transport/PluginHookRunner.ts',
                            '--host',
                            'claude',
                        ],
                        timeout: 10,
                        statusMessage: 'Loading available skills overview',
                    },
                ],
            },
        ],
    },
};
const mcpManifest = {
    mcpServers: {
        'i9-skills': {
            type: 'stdio',
            command: 'node',
            args: ['${CLAUDE_PLUGIN_ROOT}/src/transport/PluginMcpServer.ts', '--host', 'claude'],
        },
    },
};
const envelope = (value) => ({
    bytes: value.length,
    sha256: sha(value),
    base64: value.toString('base64'),
});

function inventory(pin) {
    const files = {
        '.claude-plugin/plugin.json': bytes(manifest),
        'mcp/claude.json': bytes(mcpManifest),
        'hooks/claude.json': bytes(hookManifest),
        '.agents/skills/skill-fixture/SKILL.md': Buffer.from(`Synthetic ${pin} fixture.`),
        '.agents/skills/skill-fixture/LICENSE': Buffer.from('Synthetic license witness.'),
        '.agents/skills/skill-fixture/references/complete.md': Buffer.from(
            `Complete ${pin} resource.`,
        ),
        '.agents/skills/skill-fixture/assets/icon.svg': Buffer.from('<svg/>'),
    };
    const entries = Object.entries(files)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([path, b]) => ({
            path,
            kind: 'file',
            bytes: b.length,
            sha256: sha(b),
            executable: false,
            target: null,
        }));
    return {
        tree_sha256: sha(JSON.stringify(entries)),
        bytes: Object.values(files).reduce((n, b) => n + b.length, 0),
        entries,
    };
}

function identity(pid) {
    const fields = ['R', ...Array(49).fill('0')];
    fields[1] = '42';
    fields[19] = String(pid + 123);
    const stat = Buffer.from(`${pid} (claude) ${fields.join(' ')}\n`);
    const after = Buffer.from(`${pid} (claude) ${['S', ...fields.slice(1)].join(' ')}\n`);
    return {
        schema_version: 2,
        status: 'observed',
        pid,
        observer_pid: 42,
        start_ticks: fields[19],
        executable: '/pilot/runtime-bin/claude',
        stat_before: envelope(stat),
        stat_after: envelope(after),
    };
}

function diagnostic(context = 'Synthetic context with "quotes" and Unicode …\n') {
    const hook = {
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
    };
    const messages = [
        'Read manifest hooks for plugin i9-skills (enabled=true): ./hooks/claude.json',
        'Loading from skillPath: /pilot/source/.agents/skills for plugin i9-skills',
        'Loaded 1 skills from plugin i9-skills custom path: /pilot/source/.agents/skills',
        'Total plugin skills loaded: 1 (0 duplicate/user-owned entries skipped)',
        'Hooks: Checking first line for async: ' + JSON.stringify(hook),
        'Hooks: Parsed initial response: ' + JSON.stringify(hook),
        JSON.stringify(
            'Hook SessionStart:startup (SessionStart) success:\n' + JSON.stringify(hook),
        ),
        `Hook SessionStart (Loading available skills overview) provided additionalContext (${context.length} chars)`,
        `MCP server "${mcp}": Successfully connected (transport: stdio) in 138ms`,
        `MCP server "${mcp}": Connection established with capabilities: ` +
            JSON.stringify({
                hasTools: true,
                hasPrompts: false,
                hasResources: false,
                hasResourceSubscribe: false,
                serverVersion: { name: 'i9-skills', version: '0.3.4' },
                protocolEra: 'legacy',
                negotiatedProtocolVersion: '2025-11-25',
            }),
        `MCP server "${mcp}": Sending SIGINT to MCP server process`,
        `MCP server "${mcp}": STDIO connection closed after 0s (cleanly)`,
        `MCP server "${mcp}": MCP server process exited cleanly`,
    ];
    return Buffer.from(
        messages.map((m) => '2026-01-01T00:00:00.000Z [DEBUG] ' + m).join('\n') + '\n',
    );
}

function fixture(phase = 'observe-a') {
    const pin = phase === 'observe-b' ? 'b' : 'a';
    const selection = { run_id: runId, host: 'claude', repetition: 1, phase, pin };
    const a = inventory('a'),
        b = inventory('b'),
        selected = pin === 'a' ? a : b;
    const contract = {
        binaries: { claude: { version: '2.1.285' } },
        mcp: { claude: { a: mcp, b: mcp } },
        source_a: { tree_sha256: a.tree_sha256 },
        source_b: { tree_sha256: b.tree_sha256 },
    };
    const snapshot = {
        schema_version: 1,
        pin,
        source_root: '/pilot/source',
        selected_inventory: selected,
        actual_inventory: selected,
        plugin_manifest: envelope(bytes(manifest)),
        mcp_manifest: envelope(bytes(mcpManifest)),
        hook_manifest: envelope(bytes(hookManifest)),
    };
    const plugin = [
        {
            id: 'i9-skills@i9-skills',
            version: '0.3.4',
            scope: 'user',
            enabled: true,
            installPath: join(
                home,
                '.claude',
                'plugins',
                'cache',
                'i9-skills',
                'i9-skills',
                '0.3.4',
            ),
            installedAt: '2026-01-01T00:00:00.000Z',
            lastUpdated: '2026-01-01T00:00:00.000Z',
            mcpServers: mcpManifest.mcpServers,
            projectEnabled: false,
        },
    ];
    const output = {
        version: Buffer.from('2.1.285 (Claude Code)\n'),
        'auth-before': bytes(auth),
        'auth-after': bytes(auth),
        plugins: bytes(plugin),
        'mcp-list': Buffer.from(
            `Checking MCP server health…\n\n${mcp}: node /pilot/source/src/transport/PluginMcpServer.ts --host claude - ✔ Connected\n`,
        ),
        'mcp-get': Buffer.from(
            `${mcp}:\n  Scope: Dynamic config (from command line)\n  Status: ✔ Connected\n  Type: stdio\n  Command: stdio\n  Args:\n  Environment:\n    CLAUDE_PLUGIN_ROOT=[REDACTED]\n    CLAUDE_PLUGIN_DATA=[REDACTED]\n`,
        ),
        'init-only': Buffer.alloc(0),
        marketplaces: bytes([]),
    };
    const absence = phase === 'baseline' || phase === 'verify-absent';
    if (absence) output.plugins = bytes([]);
    const config = new NativeClaudeRawConfiguration();
    const records = config.commands(mcp, config.diagnostic(selection), phase).map((command, i) => {
        const id = identity(100 + i);
        return {
            command,
            process: {
                status: 'completed',
                exit_code:
                    command.label.startsWith('auth-') || (absence && command.label === 'mcp-get')
                        ? 1
                        : 0,
                signal: null,
                pid: id.pid,
                start_ticks: id.start_ticks,
                identity: id,
                stdout: output[command.label],
                stderr: Buffer.alloc(0),
                cleanup: 'group-absent',
            },
        };
    });
    return {
        selection,
        contract,
        records,
        diagnostic: absence ? null : diagnostic(),
        before: absence ? null : structuredClone(snapshot),
        after: absence ? null : structuredClone(snapshot),
        inputs_unchanged: true,
        observer_pid: 42,
    };
}

for (const phase of ['observe-a', 'observe-b', 'observe-restored-a']) {
    test(`observes independent supported facts for exact ${phase} pin, never full native acceptance`, () => {
        const f = fixture(phase),
            r = new NativeClaudeObservationValidator().project(f);
        assert.equal(r.status, 'observed', r.reason);
        assert.equal(
            r.loaded.source_tree_sha256,
            f.contract[f.selection.pin === 'a' ? 'source_a' : 'source_b'].tree_sha256,
        );
        assert.equal(r.loaded.file_count, 4);
        assert.equal(r.native_acceptance, false);
        assert.ok(r.checks.session_start_output && r.checks.mcp_initial_health);
        assert.ok(r.unsupported.includes('read-only-mcp-state-preservation'));
    });
}

for (const [name, mutate] of [
    [
        'wrong selected pin',
        (f) => {
            f.selection.pin = 'b';
        },
    ],
    [
        'resource removed after init',
        (f) => {
            f.after.actual_inventory.entries.splice(0, 1);
        },
    ],
    [
        'changed source after init',
        (f) => {
            f.after.actual_inventory.entries[0].sha256 = 'a'.repeat(64);
        },
    ],
    [
        'manifest data detached from selected bytes',
        (f) => {
            f.before.plugin_manifest = envelope(bytes({ name: 'i9-skills', version: '9.9.9' }));
        },
    ],
    [
        'changed inputs',
        (f) => {
            f.inputs_unchanged = false;
        },
    ],
    [
        'nonzero init',
        (f) => {
            f.records.find((r) => r.command.label === 'init-only').process.exit_code = 2;
        },
    ],
    [
        'unknown stderr',
        (f) => {
            f.records[0].process.stderr = Buffer.from('warning\n');
        },
    ],
    [
        'injected argv',
        (f) => {
            f.records[0].command.argv = ['-p', 'synthetic'];
        },
    ],
    [
        'unbounded timeout',
        (f) => {
            f.records[0].command.timeout_ms = 12001;
        },
    ],
    [
        'truncated JSON escaping',
        (f) => {
            f.diagnostic = Buffer.from(
                f.diagnostic.toString().replace('success:\\n', 'success:\\x'),
            );
        },
    ],
    [
        'contradictory hook output',
        (f) => {
            f.diagnostic = Buffer.from(
                f.diagnostic
                    .toString()
                    .replace(
                        'Hook SessionStart (Loading available skills overview) provided additionalContext (',
                        'Hook SessionStart (Loading available skills overview) provided additionalContext (9',
                    ),
            );
        },
    ],
    [
        'duplicated relevant diagnostic',
        (f) => {
            f.diagnostic = Buffer.concat([
                f.diagnostic,
                Buffer.from(f.diagnostic.toString().split('\n')[0] + '\n'),
            ]);
        },
    ],
    [
        'invalid UTF-8',
        (f) => {
            f.diagnostic = Buffer.from([255]);
        },
    ],
])
    test(`rejects ${name}`, () => {
        const f = fixture();
        mutate(f);
        assert.equal(new NativeClaudeObservationValidator().project(f).status, 'blocked');
    });

test('clean version output cannot substitute for actual child identity', () => {
    const f = fixture();
    f.records[0].process.identity.stat_before.sha256 = '0'.repeat(64);
    const r = new NativeClaudeObservationValidator().project(f);
    assert.equal(r.status, 'partial');
    assert.equal(r.checks.fresh_native_processes, false);
});

test('same native pid/ticks across calls never proves fresh instances', () => {
    const f = fixture();
    f.records[1].process.identity = structuredClone(f.records[0].process.identity);
    f.records[1].process.pid = f.records[0].process.pid;
    f.records[1].process.start_ticks = f.records[0].process.start_ticks;
    assert.equal(
        new NativeClaudeObservationValidator().project(f).checks.fresh_native_processes,
        false,
    );
});

for (const scenario of [
    'foreign-parent',
    'changed-ticks',
    'zombie',
    'invalid-second',
    'forged-observer',
]) {
    test(`complete static projection cannot assert fresh child after ${scenario}`, () => {
        const f = fixture();
        const id = f.records[0].process.identity;
        const rewrite = (receipt, change) => {
            const raw = Buffer.from(receipt.base64, 'base64').toString();
            const close = raw.lastIndexOf(')');
            const fields = raw
                .slice(close + 2)
                .trim()
                .split(/\s+/);
            change(fields);
            return envelope(Buffer.from(raw.slice(0, close + 2) + fields.join(' ') + '\n'));
        };
        if (scenario === 'foreign-parent') {
            id.stat_before = rewrite(id.stat_before, (fields) => {
                fields[1] = '1';
            });
            id.stat_after = rewrite(id.stat_after, (fields) => {
                fields[1] = '1';
            });
        }
        if (scenario === 'changed-ticks')
            id.stat_after = rewrite(id.stat_after, (fields) => {
                fields[19] = '9999';
            });
        if (scenario === 'zombie')
            id.stat_after = rewrite(id.stat_after, (fields) => {
                fields[0] = 'Z';
            });
        if (scenario === 'invalid-second')
            id.stat_after = envelope(Buffer.from('invalid second sample\n'));
        if (scenario === 'forged-observer') {
            id.observer_pid = 99;
            id.stat_before = rewrite(id.stat_before, (fields) => {
                fields[1] = '99';
            });
            id.stat_after = rewrite(id.stat_after, (fields) => {
                fields[1] = '99';
            });
        }
        // All forged receipt hashes are valid; only the ownership semantics can reject them.
        const r = new NativeClaudeObservationValidator().project(f);
        assert.equal(r.checks.fresh_native_processes, false);
        assert.equal(r.status, 'partial', r.reason);
    });
}

test('static projection requires a separately supplied measured observer PID', () => {
    const f = fixture();
    delete f.observer_pid;
    const r = new NativeClaudeObservationValidator().project(f);
    assert.equal(r.status, 'blocked');
    assert.equal(r.reason, 'claude_observer_identity');
});

test('MCP health cannot imply resources, catalog calls or unchanged state', () => {
    const r = new NativeClaudeObservationValidator().project(fixture());
    assert.equal(r.checks.mcp_initial_health, true);
    assert.ok(r.unsupported.includes('native-mcp-catalog-and-resource-calls'));
    assert.equal(r.checks.owned_hooks_and_mcp_absent, false);
});

test('out-of-order hook or shutdown messages are rejected despite individually valid text', () => {
    const f = fixture();
    const lines = f.diagnostic.toString().trimEnd().split('\n');
    [lines[4], lines[5]] = [lines[5], lines[4]];
    f.diagnostic = Buffer.from(lines.join('\n') + '\n');
    const result = new NativeClaudeObservationValidator().project(f);
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'claude_diagnostic_event_order');
});

test('owned hook/MCP error remains blocked even when a success-shaped payload is also present', () => {
    const f = fixture();
    f.diagnostic = Buffer.concat([
        f.diagnostic,
        Buffer.from('2026-01-01T00:00:00.000Z [ERROR] i9-skills hook failed\n'),
    ]);
    assert.equal(
        new NativeClaudeObservationValidator().project(f).reason,
        'claude_owned_runtime_diagnostic',
    );
});

for (const phase of ['baseline', 'verify-absent'])
    test(`${phase} collects no init and qualifies unknown native absence`, () => {
        const f = fixture(phase);
        assert.ok(f.records.every((r) => r.command.label !== 'init-only'));
        const r = new NativeClaudeObservationValidator().project(f);
        assert.equal(r.status, 'partial', r.reason);
        assert.equal(r.checks.owned_plugin_and_marketplace_absent, true);
        assert.equal(r.checks.owned_hooks_and_mcp_absent, false);
        assert.equal(r.native_acceptance, false);
    });

test('foreign, disabled or wrong-version registration does not establish selected enabled plugin', () => {
    for (const delta of [{ id: 'foreign@owner' }, { enabled: false }, { version: '0.4.0' }]) {
        const f = fixture();
        const p = f.records.find((r) => r.command.label === 'plugins').process;
        const rows = JSON.parse(p.stdout);
        Object.assign(rows[0], delta);
        p.stdout = bytes(rows);
        assert.equal(
            new NativeClaudeObservationValidator().project(f).checks.selected_plugin_enabled,
            false,
        );
    }
});
