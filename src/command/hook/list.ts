// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { HostHookConfiguration } from '../../service/HostHookConfiguration.ts';

export default class HookListCommand extends Command {
    static description = 'List implemented hooks and planned metrics connections as JSON.';

    async run(): Promise<void> {
        await this.parse(HookListCommand);
        this.log(JSON.stringify(new HostHookConfiguration().inventory(), null, 2));
    }
}
