// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { HostHookConfiguration, sessionHosts } from '../../service/HostHookConfiguration.ts';
import type { SessionHost } from '../../service/HostHookConfiguration.ts';
import { SessionHookCommandConfiguration } from '../../config/SessionHookCommandConfiguration.ts';

export default class SessionConfigCommand extends Command {
    static description = 'Print one host-specific session configuration; never write or enable it.';
    static examples = [
        '<%= config.bin %> hook session-config --host gemini',
        '<%= config.bin %> hook session-config --host claude --executable /project/node_modules/.bin/i9-skills --project /project --no-global',
    ];
    static flags = {
        ...SessionHookCommandConfiguration.flags,
        host: Flags.string({
            description: 'Documented host adapter.',
            options: [...sessionHosts],
            required: true,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(SessionConfigCommand);
        this.log(
            JSON.stringify(
                new HostHookConfiguration().sessionConfiguration(
                    flags.host as SessionHost,
                    SessionHookCommandConfiguration.selection(flags),
                ),
                null,
                2,
            ),
        );
    }
}
