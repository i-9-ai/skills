// SPDX-License-Identifier: Apache-2.0
import { CodexHookConfiguration } from './CodexHookConfiguration.ts';

export const sessionHosts = [
    'codex',
    'claude',
    'copilot',
    'gemini',
    'antigravity',
    'hermes',
] as const;
export type SessionHost = (typeof sessionHosts)[number];

/** Maps the same context capability to independently documented host contracts. */
export class HostHookConfiguration {
    private command(host: SessionHost): string {
        return (
            'node "$(git rev-parse --show-toplevel)/bin/index.mjs" hook session-index' +
            ' --host ' +
            host +
            ' --project "$(git rev-parse --show-toplevel)"'
        );
    }

    sessionConfiguration(host: SessionHost): object {
        if (host === 'codex') return new CodexHookConfiguration().codexSessionHook();
        if (host === 'antigravity') {
            return {
                'i9-available-skills': {
                    PreInvocation: [{ type: 'command', command: this.command(host), timeout: 3 }],
                },
            };
        }
        if (host === 'hermes') {
            // Hermes tokenizes with shlex.split(shell=False). Invoke the POSIX
            // shell explicitly so the existing checkout-root expansion is real.
            return {
                hooks: {
                    pre_llm_call: [{ command: "sh -c '" + this.command(host) + "'", timeout: 3 }],
                },
            };
        }
        if (host === 'copilot') {
            return {
                version: 1,
                hooks: {
                    sessionStart: [{ type: 'command', bash: this.command(host), timeoutSec: 3 }],
                },
            };
        }
        if (host === 'claude') {
            return {
                hooks: {
                    SessionStart: [
                        {
                            matcher: 'startup|resume|clear|compact',
                            hooks: [{ type: 'command', command: this.command(host), timeout: 3 }],
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
                                    command: this.command(host),
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
                platforms: 'POSIX checkout with Node 24, Git and explicit npm ci',
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
}
