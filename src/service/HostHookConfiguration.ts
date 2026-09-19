// SPDX-License-Identifier: Apache-2.0
import { CodexHookConfiguration } from './CodexHookConfiguration.ts';

export const sessionHosts = ['codex', 'claude', 'copilot', 'gemini'] as const;
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
                event: host === 'copilot' ? 'sessionStart' : 'SessionStart',
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
            {
                name: 'skill-read-metrics',
                host: 'all',
                status: 'unimplemented; successful read payload mapping and coverage unproven',
                fallback: 'mcp usage records explicit observed reads only',
            },
        ];
    }
}
