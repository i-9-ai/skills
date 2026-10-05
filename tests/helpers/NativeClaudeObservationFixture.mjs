// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import { NativeClaudeRawConfiguration } from '../../src/config/NativeClaudeRawConfiguration.ts';
import { NativeClaudeObservationValidator } from '../../src/validator/NativeClaudeObservationValidator.ts';

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

export { fixture };
