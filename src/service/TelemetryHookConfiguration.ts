// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import { SkillReadIdentityRepository } from '../repository/SkillReadIdentityRepository.ts';

/** Prints a Claude observation registration; it neither grants access nor installs it. */
export class TelemetryHookConfiguration {
    configuration(database: string, collections: string[]) {
        if (!isAbsolute(database) || /[\r\n\0]/.test(database)) {
            throw new Error('Select an absolute database filename');
        }
        new SkillReadIdentityRepository().sources(collections);
        const command =
            'node "$(git rev-parse --show-toplevel)/bin/index.mjs" hook observe --host claude' +
            ' --db ' +
            this.quote(database) +
            collections.map((source) => ' --collection ' + this.quote(source)).join('');
        const handler = { type: 'command', command, timeout: 10 };
        return {
            hooks: {
                SessionStart: [{ matcher: 'startup|clear', hooks: [handler] }],
                PreToolUse: [{ matcher: '^Read$', hooks: [handler] }],
                PostToolUse: [{ matcher: '^Read$', hooks: [handler] }],
            },
        };
    }

    private quote(value: string): string {
        if (/[\r\n\0]/.test(value)) throw new Error('Hook arguments cannot contain control lines');
        return "'" + value.replaceAll("'", "'\"'\"'") + "'";
    }
}
