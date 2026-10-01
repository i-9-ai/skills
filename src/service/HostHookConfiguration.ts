// SPDX-License-Identifier: Apache-2.0
import { CodexHookConfiguration } from './CodexHookConfiguration.ts';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { HookRuntimeRepository } from '../repository/HookRuntimeRepository.ts';

export const sessionHosts = [
    'codex',
    'claude',
    'copilot',
    'gemini',
    'antigravity',
    'hermes',
] as const;
export type SessionHost = (typeof sessionHosts)[number];
export type SessionHookSelection = {
    executable?: string;
    project?: string;
    global?: boolean;
    globalRoot?: string;
    maxEntries?: number;
};

/** Maps the same context capability to independently documented host contracts. */
export class HostHookConfiguration {
    private command(host: SessionHost, selection: SessionHookSelection): string {
        const checkout = 'node "$(git rev-parse --show-toplevel)/bin/index.mjs"';
        const selected =
            selection.executable !== undefined ||
            selection.project !== undefined ||
            selection.global === false ||
            selection.globalRoot !== undefined ||
            selection.maxEntries !== undefined;
        if (!selected) {
            return (
                checkout +
                ' hook session-index' +
                (host === 'codex'
                    ? ''
                    : ' --host ' + host + ' --project "$(git rev-parse --show-toplevel)"')
            );
        }
        const executable =
            selection.executable === undefined
                ? checkout
                : this.quote(new HookRuntimeRepository().executable(selection.executable));
        const project =
            selection.project === undefined
                ? selection.executable === undefined
                    ? '"$(git rev-parse --show-toplevel)"'
                    : '"$PWD"'
                : this.quote(this.selectedRoot(selection.project));
        let command = executable + ' hook session-index --host ' + host + ' --project ' + project;
        if (selection.global === false) command += ' --no-global';
        if (selection.globalRoot !== undefined) {
            command += ' --global-root ' + this.quote(this.selectedRoot(selection.globalRoot));
        }
        if (selection.maxEntries !== undefined) {
            if (
                !Number.isInteger(selection.maxEntries) ||
                selection.maxEntries < 1 ||
                selection.maxEntries > 100
            ) {
                throw new Error('Select a maximum of 1–100 displayed skills.');
            }
            command += ' --max-entries ' + selection.maxEntries;
        }
        return command;
    }

    sessionConfiguration(host: SessionHost, selection: SessionHookSelection = {}): object {
        if (!sessionHosts.includes(host)) {
            throw new Error('Unsupported host; use context available-skills manually.');
        }
        const command = this.command(host, selection);
        if (host === 'codex') return new CodexHookConfiguration().codexSessionHook(command);
        if (host === 'antigravity') {
            return {
                'i9-available-skills': {
                    PreInvocation: [{ type: 'command', command, timeout: 3 }],
                },
            };
        }
        if (host === 'hermes') {
            // Hermes tokenizes with shlex.split(shell=False). Invoke the POSIX
            // shell explicitly so the existing checkout-root expansion is real.
            return {
                hooks: {
                    pre_llm_call: [{ command: 'sh -c ' + this.quote(command), timeout: 3 }],
                },
            };
        }
        if (host === 'copilot') {
            return {
                version: 1,
                hooks: {
                    sessionStart: [{ type: 'command', bash: command, timeoutSec: 3 }],
                },
            };
        }
        if (host === 'claude') {
            return {
                hooks: {
                    SessionStart: [
                        {
                            matcher: 'startup|resume|clear|compact',
                            hooks: [{ type: 'command', command, timeout: 3 }],
                        },
                    ],
                },
            };
        }
        if (host === 'gemini') {
            return {
                hooks: {
                    SessionStart: [
                        {
                            hooks: [
                                {
                                    name: 'i9-available-skills',
                                    type: 'command',
                                    command,
                                    timeout: 3000,
                                    description: 'Load the installed skills overview.',
                                },
                            ],
                        },
                    ],
                },
            };
        }
        throw new Error('Unsupported host; use context available-skills manually.');
    }

    sessionOutput(host: SessionHost, context: string): string {
        if (host === 'codex') return context.trimEnd();
        if (host === 'antigravity')
            return JSON.stringify({ injectSteps: [{ ephemeralMessage: context }] });
        if (host === 'hermes') return JSON.stringify({ context });
        if (host === 'copilot') return JSON.stringify({ additionalContext: context });
        if (host === 'claude') {
            return JSON.stringify({
                hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
            });
        }
        if (host === 'gemini') {
            return JSON.stringify({ hookSpecificOutput: { additionalContext: context } });
        }
        throw new Error('Unsupported host; use context available-skills manually.');
    }

    inventory(): object[] {
        return [
            ...sessionHosts.map((host) => ({
                name: 'session-index',
                host,
                event: this.event(host),
                command: 'hook session-index --host ' + host,
                effect: 'read project and optional global skill metadata',
                status: 'implemented; configuration and output fixture-tested',
                hostExecution: 'not tested; trust and enablement remain external',
                platforms:
                    'POSIX prepared checkout or explicit retained local CLI executable; Node 24 required',
            })),
            {
                name: 'session-index',
                host: 'opencode',
                status: 'unimplemented; requires a separately reviewed plugin adapter',
                fallback: 'context available-skills',
            },
            ...(['claude', 'codex', 'gemini', 'copilot'] as const).map((host) => ({
                name: 'skill-read-metrics',
                host,
                status: 'implemented; native payload mapping and metadata storage fixture-tested',
                command: 'hook observe --host ' + host,
                hostExecution: 'not tested; no registration installed',
                coverage: {
                    claude: 'SKILL.md native Read only; paired tool-use identifiers; no implicit loading or reference files',
                    codex: 'SKILL.md literal cat/sed Bash only; exact returned text verified after collection confinement; no arbitrary shell execution',
                    gemini: 'SKILL.md read_file only; successful AfterTool receipt; timestamp identities cannot pair attempts and observations',
                    copilot:
                        'SKILL.md CLI view only; successful postToolUse receipt; timestamp identities cannot pair attempts and observations',
                }[host],
            })),
            {
                name: 'skill-read-metrics',
                host: 'other',
                status: 'unimplemented for other hosts; successful-read mapping requires a reviewed native contract',
                fallback: 'telemetry record or mcp serve with explicit observed evidence',
            },
        ];
    }

    private event(host: SessionHost): string {
        if (host === 'copilot') return 'sessionStart';
        if (host === 'antigravity') return 'PreInvocation (invocationNum=0)';
        if (host === 'hermes') return 'pre_llm_call (is_first_turn=true)';
        return 'SessionStart';
    }

    private selectedRoot(root: string): string {
        return new ProjectConfiguration({ root, environment: {} }).root();
    }

    private quote(value: string): string {
        if (/[\x00-\x1f\x7f]/.test(value))
            throw new Error('Hook selections cannot contain control characters.');
        return "'" + value.replaceAll("'", "'\"'\"'") + "'";
    }
}
