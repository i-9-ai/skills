// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import { SkillReadIdentityRepository } from '../repository/SkillReadIdentityRepository.ts';

/** Prints a reviewed native registration; it neither grants access nor installs it. */
export class TelemetryHookConfiguration {
    configuration(
        database: string,
        collections: string[],
        host = 'claude',
        commandPrefix?: string,
    ) {
        if (!isAbsolute(database) || /[\r\n\0]/.test(database)) {
            throw new Error('Select an absolute database filename');
        }
        if (
            commandPrefix !== undefined &&
            (!commandPrefix || commandPrefix.length > 8192 || /[\x00-\x1f\x7f]/.test(commandPrefix))
        )
            throw new Error('Select a bounded command prefix');
        new SkillReadIdentityRepository().sources(collections);
        const command =
            (commandPrefix ?? 'node "$(git rev-parse --show-toplevel)/bin/index.mjs"') +
            ' hook observe --host ' +
            this.host(host) +
            ' --db ' +
            this.quote(database) +
            collections.map((source) => ' --collection ' + this.quote(source)).join('');
        const handler = { type: 'command', command, timeout: 10 };
        if (host === 'copilot')
            return {
                version: 1,
                hooks: Object.fromEntries(
                    ['sessionStart', 'preToolUse', 'postToolUse'].map((event) => [
                        event,
                        [{ type: 'command', bash: command + ' --event ' + event, timeoutSec: 10 }],
                    ]),
                ),
            };
        if (host === 'gemini')
            return {
                hooks: {
                    SessionStart: [{ hooks: [{ ...handler, timeout: 10000 }] }],
                    BeforeTool: [
                        { matcher: '^read_file$', hooks: [{ ...handler, timeout: 10000 }] },
                    ],
                    AfterTool: [
                        { matcher: '^read_file$', hooks: [{ ...handler, timeout: 10000 }] },
                    ],
                },
            };
        const matcher = host === 'codex' ? '^Bash$' : '^Read$';
        return {
            hooks: {
                SessionStart: [
                    { matcher: host === 'codex' ? 'startup' : 'startup|clear', hooks: [handler] },
                ],
                PreToolUse: [{ matcher, hooks: [handler] }],
                PostToolUse: [{ matcher, hooks: [handler] }],
            },
        };
    }

    private host(value: string): string {
        if (!['claude', 'codex', 'gemini', 'copilot'].includes(value))
            throw new Error('Unsupported telemetry host');
        return value;
    }

    private quote(value: string): string {
        if (/[\r\n\0]/.test(value)) throw new Error('Hook arguments cannot contain control lines');
        return "'" + value.replaceAll("'", "'\"'\"'") + "'";
    }
}
