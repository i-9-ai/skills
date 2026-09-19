// SPDX-License-Identifier: Apache-2.0
import AvailableSkillsCommand from '../context/available-skills.ts';
import { Flags } from '@oclif/core';
import { HostHookConfiguration, sessionHosts } from '../../service/HostHookConfiguration.ts';
import type { SessionHost } from '../../service/HostHookConfiguration.ts';

/** SessionStart lifecycle adapter; discovery remains owned by the reusable context command. */
export default class SessionIndexHookCommand extends AvailableSkillsCommand {
    static flags = {
        ...AvailableSkillsCommand.flags,
        host: Flags.string({
            description: 'Host output envelope; no stdin, transcript or prompt is read.',
            options: [...sessionHosts],
            default: 'codex',
        }),
    };
    static description =
        'Render compact skill context for the configured SessionStart lifecycle hook.';
    static examples = [
        '<%= config.bin %> hook session-index',
        '<%= config.bin %> hook session-index --project ./example-project --no-global',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(SessionIndexHookCommand);
        this.log(
            new HostHookConfiguration().sessionOutput(
                flags.host as SessionHost,
                this.renderContext(flags),
            ),
        );
    }
}
