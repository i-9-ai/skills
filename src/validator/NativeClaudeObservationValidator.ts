// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NativeClaudeRawConfiguration } from '../config/NativeClaudeRawConfiguration.ts';
import type { NativeClaudeRawSelection } from '../config/NativeClaudeRawConfiguration.ts';
import type { NativePilotContract } from '../config/NativePilotConfiguration.ts';
import type { NativeClaudeRawCommand } from '../config/NativeClaudeRawConfiguration.ts';
import type {
    NativeClaudeRawProcess,
    NativeClaudeSourceSnapshot,
} from '../repository/NativeClaudeRawProcessRepository.ts';
import type { NativePilotInventory } from '../repository/NativePilotInventoryRepository.ts';
import { NativeClaudeProcessIdentityValidator } from './NativeClaudeProcessIdentityValidator.ts';
import { relativePilotPath } from './NativePilotContractValidator.ts';

export interface NativeClaudeObservationRecord {
    command: NativeClaudeRawCommand;
    process: NativeClaudeRawProcess;
}

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('claude_object');
    return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: string[]) =>
    same(Object.keys(value).sort(), keys.slice().sort());
const text = (value: Uint8Array) => {
    if (!(value instanceof Uint8Array) || value.length > 1_048_576 || value.includes(0))
        throw new Error('claude_output_bound');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value);
};
const parse = (value: Uint8Array) => JSON.parse(text(value)) as unknown;
const normalHome = join('/', 'home', 'node');

/** Pure projection of retained pinned-native bytes. No filesystem, process or provider effects. */
export class NativeClaudeObservationValidator {
    private inventory(value: NativePilotInventory, expected: string): void {
        if (
            !value ||
            !Array.isArray(value.entries) ||
            value.entries.length > 20_000 ||
            value.tree_sha256 !== expected ||
            digest(JSON.stringify(value.entries)) !== expected
        )
            throw new Error('claude_inventory_identity');
        let previous = '';
        let bytes = 0;
        for (const entry of value.entries) {
            if (
                entry.path <= previous ||
                !relativePilotPath(entry.path) ||
                !Number.isSafeInteger(entry.bytes) ||
                entry.bytes < 0 ||
                typeof entry.executable !== 'boolean' ||
                !['file', 'directory', 'symlink'].includes(entry.kind)
            )
                throw new Error('claude_inventory_entry');
            if (entry.kind === 'file') {
                if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') || entry.target !== null)
                    throw new Error('claude_inventory_file');
                bytes += entry.bytes;
            } else if (entry.kind === 'directory') {
                if (
                    entry.bytes !== 0 ||
                    entry.sha256 !== null ||
                    entry.target !== null ||
                    entry.executable
                )
                    throw new Error('claude_inventory_directory');
            } else if (
                typeof entry.target !== 'string' ||
                entry.executable ||
                Buffer.byteLength(entry.target) !== entry.bytes ||
                digest(entry.target) !== entry.sha256 ||
                entry.path.startsWith('.agents/skills/')
            )
                throw new Error('claude_inventory_alias');
            previous = entry.path;
        }
        if (bytes !== value.bytes) throw new Error('claude_inventory_bytes');
    }

    private manifest(snapshot: NativeClaudeSourceSnapshot, kind: 'plugin' | 'mcp' | 'hook') {
        const receipt =
            kind === 'plugin'
                ? snapshot.plugin_manifest
                : kind === 'mcp'
                  ? snapshot.mcp_manifest
                  : snapshot.hook_manifest;
        const path =
            kind === 'plugin'
                ? '.claude-plugin/plugin.json'
                : kind === 'mcp'
                  ? 'mcp/claude.json'
                  : 'hooks/claude.json';
        const bytes = Buffer.from(receipt.base64, 'base64');
        const entry = snapshot.selected_inventory.entries.find(
            (e) => e.path === path && e.kind === 'file',
        );
        if (
            bytes.toString('base64') !== receipt.base64 ||
            receipt.bytes !== bytes.length ||
            receipt.sha256 !== digest(bytes) ||
            !entry ||
            entry.sha256 !== receipt.sha256 ||
            entry.bytes !== receipt.bytes
        )
            throw new Error('claude_manifest_identity');
        return object(parse(bytes));
    }

    /** The caller must first verify raw receipt bytes and source selection, not trust report booleans. */
    project(input: {
        selection: NativeClaudeRawSelection;
        contract: NativePilotContract;
        records: NativeClaudeObservationRecord[];
        diagnostic: Uint8Array | null;
        before: NativeClaudeSourceSnapshot | null;
        after: NativeClaudeSourceSnapshot | null;
        inputs_unchanged: boolean;
        observer_pid: number;
    }) {
        const checks = {
            version: false,
            unauthenticated: false,
            fresh_native_processes: false,
            selected_plugin_enabled: false,
            loaded_full_package_bytes: false,
            session_start_output: false,
            mcp_initial_health: false,
            mcp_clean_stop: false,
            owned_plugin_and_marketplace_absent: false,
            owned_hooks_and_mcp_absent: false,
        };
        const unsupported = [
            'native-mcp-catalog-and-resource-calls',
            'read-only-mcp-state-preservation',
            'unrelated-settings-and-history-preservation',
            'native-plugin-data-preservation',
            'complete-A/B/A-lifecycle-acceptance',
        ];
        const result = {
            schema_version: 1,
            kind: 'claude-supported-observations' as const,
            native_acceptance: false,
            checks,
            status: 'blocked' as 'observed' | 'partial' | 'blocked',
            reason: 'claude_observation_unrecognized',
            loaded: null as null | {
                source_root: string;
                source_tree_sha256: string;
                packages: string[];
                file_count: number;
            },
            hook: null as null | {
                event: 'SessionStart';
                context_sha256: string;
                bytes: number;
                chars: number;
            },
            diagnostic_messages: [] as { line: number; level: string; sha256: string }[],
            unsupported,
            manual_fallback:
                'Retain the fixed native CLI and init-only receipts. Review unsupported host inventory and MCP operations separately; use the bundled stdio MCP server for explicit portable catalog/resource checks, without calling those native-host observations.',
        };
        try {
            const config = new NativeClaudeRawConfiguration();
            const s = input.selection;
            config.selection([
                '--contract',
                '/pilot/contract.json',
                '--root',
                '/pilot',
                '--run-id',
                s.run_id,
                '--host',
                s.host,
                '--repetition',
                String(s.repetition),
                '--phase',
                s.phase,
                '--pin',
                s.pin,
            ]);
            if (input.contract.binaries.claude.version !== '2.1.285')
                throw new Error('claude_version_pin');
            const absence = s.phase === 'baseline' || s.phase === 'verify-absent';
            const mcp = input.contract.mcp.claude[s.pin];
            const recipe = config.commands(mcp, config.diagnostic(s), s.phase);
            if (recipe.length !== input.records.length || !input.inputs_unchanged)
                throw new Error('claude_recipe_incomplete_or_changed');
            const identities: string[] = [];
            if (!Number.isSafeInteger(input.observer_pid) || input.observer_pid < 2)
                throw new Error('claude_observer_identity');
            const codec = new NativeClaudeProcessIdentityValidator();
            for (const [i, r] of input.records.entries()) {
                const { timeout_ms, ...actual } = r.command;
                const { timeout_ms: _timeout, ...expected } = recipe[i];
                if (
                    !same(actual, expected) ||
                    !Number.isSafeInteger(timeout_ms) ||
                    timeout_ms < 1 ||
                    timeout_ms > 12_000
                )
                    throw new Error('claude_recipe_identity');
                if (
                    r.process.stdout.length + r.process.stderr.length > 1_048_576 ||
                    r.process.status !== 'completed' ||
                    r.process.signal !== null ||
                    r.process.cleanup !== 'group-absent' ||
                    r.process.stderr.length !== 0
                )
                    throw new Error('claude_process_incomplete_or_diagnostic');
                const allowedExit = r.command.label.startsWith('auth-')
                    ? 1
                    : absence && r.command.label === 'mcp-get'
                      ? 1
                      : 0;
                if (r.process.exit_code !== allowedExit) throw new Error('claude_process_exit');
                const id = codec.validate(r.process.identity, input.observer_pid);
                if (id && id.pid === r.process.pid && id.start_ticks === r.process.start_ticks)
                    identities.push(`${id.pid}:${id.start_ticks}`);
            }
            checks.fresh_native_processes =
                identities.length === recipe.length && new Set(identities).size === recipe.length;
            const record = (label: string) =>
                input.records.find((r) => r.command.label === label)!.process;
            checks.version = text(record('version').stdout) === '2.1.285 (Claude Code)\n';
            if (!checks.version) throw new Error('claude_version_output');
            const auth = (label: string) => {
                const value = object(parse(record(label).stdout));
                return (
                    exact(value, [
                        'loggedIn',
                        'authMethod',
                        'apiProvider',
                        'analyticsDisabled',
                        'projectsDirectory',
                        'configDirectory',
                    ]) &&
                    value.loggedIn === false &&
                    value.authMethod === 'none' &&
                    value.apiProvider === 'firstParty' &&
                    value.analyticsDisabled === false &&
                    value.configDirectory === join(normalHome, '.claude') &&
                    value.projectsDirectory === join(normalHome, '.claude', 'projects')
                );
            };
            checks.unauthenticated = auth('auth-before') && auth('auth-after');
            const plugins = parse(record('plugins').stdout);
            if (!Array.isArray(plugins)) throw new Error('claude_plugin_output');
            if (absence) {
                const marketplaces = parse(record('marketplaces').stdout);
                checks.owned_plugin_and_marketplace_absent =
                    plugins.length === 0 &&
                    Array.isArray(marketplaces) &&
                    marketplaces.length === 0;
                result.reason = 'claude_no_init_capture_native_hook_and_mcp_absence_unsupported';
                result.unsupported.push('native-hook-and-mcp-absence-inventory');
                result.status =
                    checks.version &&
                    checks.unauthenticated &&
                    checks.fresh_native_processes &&
                    checks.owned_plugin_and_marketplace_absent
                        ? 'partial'
                        : 'blocked';
                return result;
            }
            const before = input.before;
            const after = input.after;
            const pin = input.contract[s.pin === 'a' ? 'source_a' : 'source_b'].tree_sha256;
            if (
                !before ||
                !after ||
                before.schema_version !== 1 ||
                after.schema_version !== 1 ||
                before.pin !== s.pin ||
                after.pin !== s.pin ||
                before.source_root !== '/pilot/source' ||
                after.source_root !== before.source_root
            )
                throw new Error('claude_source_snapshot_missing');
            for (const snapshot of [before, after]) {
                this.inventory(snapshot.selected_inventory, pin);
                this.inventory(snapshot.actual_inventory, pin);
                if (!same(snapshot.selected_inventory, snapshot.actual_inventory))
                    throw new Error('claude_source_inventory_differs');
            }
            if (!same(before, after)) throw new Error('claude_source_changed');
            const manifest = this.manifest(before, 'plugin');
            const mcpManifest = this.manifest(before, 'mcp');
            const hookManifest = this.manifest(before, 'hook');
            if (
                manifest.name !== 'i9-skills' ||
                typeof manifest.version !== 'string' ||
                !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
                manifest.skills !== './.agents/skills/' ||
                manifest.hooks !== './hooks/claude.json' ||
                manifest.mcpServers !== './mcp/claude.json'
            )
                throw new Error('claude_selected_manifest');
            if (
                !same(object(hookManifest.hooks).SessionStart, [
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
                ])
            )
                throw new Error('claude_selected_hook_manifest');
            if (plugins.length !== 1) throw new Error('claude_plugin_inventory_unknown');
            const plugin = object(plugins[0]);
            const installed = join(
                normalHome,
                '.claude',
                'plugins',
                'cache',
                'i9-skills',
                'i9-skills',
                manifest.version,
            );
            checks.selected_plugin_enabled =
                exact(plugin, [
                    'id',
                    'version',
                    'scope',
                    'enabled',
                    'installPath',
                    'installedAt',
                    'lastUpdated',
                    'mcpServers',
                    'projectEnabled',
                ]) &&
                plugin.id === 'i9-skills@i9-skills' &&
                plugin.version === manifest.version &&
                plugin.scope === 'user' &&
                plugin.enabled === true &&
                plugin.projectEnabled === false &&
                plugin.installPath === installed &&
                typeof plugin.installedAt === 'string' &&
                /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(plugin.installedAt) &&
                typeof plugin.lastUpdated === 'string' &&
                /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(plugin.lastUpdated) &&
                same(plugin.mcpServers, mcpManifest.mcpServers);
            if (!input.diagnostic) throw new Error('claude_diagnostic_missing');
            const lines = text(input.diagnostic).split('\n');
            if (lines.pop() !== '') throw new Error('claude_diagnostic_truncated');
            const messages = lines.map((line, index) => {
                const match =
                    /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z) \[(DEBUG|INFO|WARN|ERROR)\] (.*)$/.exec(
                        line,
                    );
                if (!match) throw new Error('claude_diagnostic_envelope');
                if (match[2] === 'WARN' || match[2] === 'ERROR')
                    result.diagnostic_messages.push({
                        line: index + 1,
                        level: match[2],
                        sha256: digest(line),
                    });
                return { level: match[2], message: match[3] };
            });
            if (
                messages.some(
                    (entry) =>
                        ['WARN', 'ERROR'].includes(entry.level) &&
                        /i9-skills|Hook SessionStart/.test(entry.message),
                )
            )
                throw new Error('claude_owned_runtime_diagnostic');
            const one = (prefix: string) => {
                const found = messages.filter((v) => v.message.startsWith(prefix));
                if (found.length !== 1 || found[0].level !== 'DEBUG')
                    throw new Error('claude_diagnostic_event_ambiguous');
                return found[0].message.slice(prefix.length);
            };
            const ordered = (prefixes: string[]) => {
                const positions = prefixes.map((prefix) =>
                    messages.findIndex((entry) => entry.message.startsWith(prefix)),
                );
                if (
                    positions.some(
                        (position, index) =>
                            position < 0 || (index > 0 && position <= positions[index - 1]),
                    )
                )
                    throw new Error('claude_diagnostic_event_order');
            };
            const names = before.selected_inventory.entries
                .filter(
                    (e) =>
                        e.kind === 'file' &&
                        /^\.agents\/skills\/[a-z0-9-]+\/SKILL\.md$/.test(e.path),
                )
                .map((e) => e.path.split('/')[2]);
            const packageFiles = before.actual_inventory.entries.filter(
                (e) => e.kind === 'file' && e.path.startsWith('.agents/skills/'),
            );
            if (
                !names.length ||
                messages.filter((entry) =>
                    /^Loaded \d+ skills from plugin i9-skills custom path: /.test(entry.message),
                ).length !== 1 ||
                one('Read manifest hooks for plugin i9-skills (enabled=true): ') !==
                    './hooks/claude.json' ||
                one('Loading from skillPath: ') !==
                    '/pilot/source/.agents/skills for plugin i9-skills' ||
                one(`Loaded ${names.length} skills from plugin i9-skills custom path: `) !==
                    '/pilot/source/.agents/skills' ||
                one('Total plugin skills loaded: ') !==
                    `${names.length} (0 duplicate/user-owned entries skipped)`
            )
                throw new Error('claude_loaded_path_or_count');
            checks.loaded_full_package_bytes = true;
            result.loaded = {
                source_root: '/pilot/source',
                source_tree_sha256: pin,
                packages: names,
                file_count: packageFiles.length,
            };
            const initial = object(JSON.parse(one('Hooks: Checking first line for async: ')));
            const parsed = object(JSON.parse(one('Hooks: Parsed initial response: ')));
            const escaped = JSON.parse(
                '"Hook SessionStart:startup (SessionStart) success:' +
                    one('"Hook SessionStart:startup (SessionStart) success:'),
            );
            if (
                typeof escaped !== 'string' ||
                !escaped.startsWith('Hook SessionStart:startup (SessionStart) success:\n')
            )
                throw new Error('claude_hook_escaped_output');
            const successful = object(
                JSON.parse(
                    escaped.slice('Hook SessionStart:startup (SessionStart) success:\n'.length),
                ),
            );
            const hook = object(initial.hookSpecificOutput);
            if (
                !exact(initial, ['hookSpecificOutput']) ||
                !exact(hook, ['hookEventName', 'additionalContext']) ||
                hook.hookEventName !== 'SessionStart' ||
                typeof hook.additionalContext !== 'string' ||
                hook.additionalContext.length < 1 ||
                hook.additionalContext.length > 10_000 ||
                !same(initial, parsed) ||
                !same(initial, successful) ||
                one(
                    'Hook SessionStart (Loading available skills overview) provided additionalContext (',
                ) !== `${hook.additionalContext.length} chars)`
            )
                throw new Error('claude_hook_context');
            checks.session_start_output = true;
            result.hook = {
                event: 'SessionStart',
                context_sha256: digest(hook.additionalContext),
                bytes: Buffer.byteLength(hook.additionalContext),
                chars: hook.additionalContext.length,
            };
            const connected = one(
                `MCP server "${mcp}": Successfully connected (transport: stdio) in `,
            );
            const capabilities = object(
                JSON.parse(one(`MCP server "${mcp}": Connection established with capabilities: `)),
            );
            const server = object(object(mcpManifest.mcpServers)[mcp.split(':')[2]]);
            if (
                server.type !== 'stdio' ||
                server.command !== 'node' ||
                !Array.isArray(server.args) ||
                server.args.some((arg) => typeof arg !== 'string')
            )
                throw new Error('claude_mcp_manifest');
            const command = [
                'node',
                ...server.args.map((arg: string) =>
                    arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', '/pilot/source'),
                ),
            ].join(' ');
            checks.mcp_initial_health =
                /^\d{1,5}ms$/.test(connected) &&
                same(capabilities, {
                    hasTools: true,
                    hasPrompts: false,
                    hasResources: false,
                    hasResourceSubscribe: false,
                    serverVersion: { name: 'i9-skills', version: manifest.version },
                    protocolEra: 'legacy',
                    negotiatedProtocolVersion: '2025-11-25',
                }) &&
                text(record('mcp-list').stdout) ===
                    `Checking MCP server health…\n\n${mcp}: ${command} - ✔ Connected\n` &&
                text(record('mcp-get').stdout) ===
                    `${mcp}:\n  Scope: Dynamic config (from command line)\n  Status: ✔ Connected\n  Type: stdio\n  Command: stdio\n  Args:\n  Environment:\n    CLAUDE_PLUGIN_ROOT=[REDACTED]\n    CLAUDE_PLUGIN_DATA=[REDACTED]\n`;
            checks.mcp_clean_stop =
                one(`MCP server "${mcp}": Sending SIGINT to MCP server process`) === '' &&
                /^\d+s \(cleanly\)$/.test(
                    one(`MCP server "${mcp}": STDIO connection closed after `),
                ) &&
                one(`MCP server "${mcp}": MCP server process exited cleanly`) === '';
            ordered([
                'Read manifest hooks for plugin i9-skills (enabled=true): ',
                'Loading from skillPath: ',
                `Loaded ${names.length} skills from plugin i9-skills custom path: `,
                'Hooks: Checking first line for async: ',
                'Hooks: Parsed initial response: ',
                '"Hook SessionStart:startup (SessionStart) success:',
                'Hook SessionStart (Loading available skills overview) provided additionalContext (',
                `MCP server "${mcp}": Sending SIGINT to MCP server process`,
                `MCP server "${mcp}": STDIO connection closed after `,
                `MCP server "${mcp}": MCP server process exited cleanly`,
            ]);
            ordered([
                `MCP server "${mcp}": Successfully connected (transport: stdio) in `,
                `MCP server "${mcp}": Connection established with capabilities: `,
                `MCP server "${mcp}": Sending SIGINT to MCP server process`,
            ]);
            result.status = Object.entries(checks)
                .filter(([key]) => !key.startsWith('owned_'))
                .every(([, value]) => value)
                ? 'observed'
                : 'partial';
            result.reason =
                result.status === 'observed'
                    ? 'claude_supported_facts_observed_other_capabilities_ungraded'
                    : 'claude_some_supported_facts_unavailable';
            return result;
        } catch (error) {
            for (const key of Object.keys(checks) as (keyof typeof checks)[]) checks[key] = false;
            result.loaded = null;
            result.hook = null;
            result.reason =
                error instanceof Error && /^claude_[a-z_]+$/.test(error.message)
                    ? error.message
                    : 'claude_output_unrecognized';
            return result;
        }
    }
}
