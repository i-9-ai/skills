// SPDX-License-Identifier: Apache-2.0

/** Describes the supported Codex registration and explicitly unimplemented telemetry. */
export class CodexHookConfiguration {
    codexSessionHook() {
        return {
            description: 'Discover a compact overview of installed project and global skills.',
            hooks: {
                SessionStart: [
                    {
                        matcher: 'startup|resume|clear|compact',
                        hooks: [
                            {
                                type: 'command',
                                command:
                                    'node "$(git rev-parse --show-toplevel)/bin/index.mjs" hook session-index',
                                timeout: 3,
                                statusMessage: 'Loading available skills overview',
                                additionalContextLimit: 1200,
                            },
                        ],
                    },
                ],
            },
        };
    }

    /** The configured adapter surface, including the boundary still awaiting proof. */
    hookInventory() {
        return [
            {
                name: 'session-index',
                host: 'codex',
                event: 'SessionStart',
                command: 'hook session-index',
                effect: 'read project and global skill metadata',
                mcp: null,
                status: 'implemented',
            },
            {
                name: 'skill-read-metrics',
                host: 'codex',
                event: 'tool completion',
                command: null,
                effect: 'record only proven reads with a stable event ID',
                mcp: 'mcp usage',
                status: 'planned; host payload mapping and automatic collection unimplemented',
            },
        ];
    }
}
