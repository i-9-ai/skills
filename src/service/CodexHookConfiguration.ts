// SPDX-License-Identifier: Apache-2.0

/** Codex SessionStart registration; read telemetry remains a separate host adapter. */
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
}
