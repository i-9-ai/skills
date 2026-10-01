// SPDX-License-Identifier: Apache-2.0
import { Flags } from '@oclif/core';
import type { SessionHookSelection } from '../service/HostHookConfiguration.ts';

/** Keeps generation and exact verification on the same session command selections. */
export class SessionHookCommandConfiguration {
    static flags = {
        executable: Flags.string({
            description:
                'Absolute existing local CLI executable; otherwise use the checkout launcher.',
        }),
        project: Flags.string({
            description:
                'Consumer project root; installed commands otherwise use the hook working directory.',
        }),
        global: Flags.boolean({
            description:
                'Include global skills; --no-global confines discovery to the selected project.',
            default: true,
            allowNo: true,
        }),
        'global-root': Flags.string({ description: 'Explicit global skill directory to embed.' }),
        'max-entries': Flags.integer({
            description: 'Maximum displayed skills; default 20, omissions disclosed.',
            min: 1,
            max: 100,
        }),
    };

    static selection(flags: {
        executable?: string;
        project?: string;
        global: boolean;
        'global-root'?: string;
        'max-entries'?: number;
    }): SessionHookSelection {
        return {
            executable: flags.executable,
            project: flags.project,
            global: flags.global,
            globalRoot: flags['global-root'],
            maxEntries: flags['max-entries'],
        };
    }
}
