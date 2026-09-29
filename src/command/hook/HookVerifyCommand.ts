// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { sessionHosts } from '../../service/HostHookConfiguration.ts';
import type { SessionHost } from '../../service/HostHookConfiguration.ts';
import { HookVerificationService } from '../../service/HookVerificationService.ts';

export default class HookVerifyCommand extends Command {
    static description = 'Compare a standalone generated host configuration; do not execute hooks.';
    static examples = ['<%= config.bin %> hook verify --host gemini --file ./proposed-hooks.json'];
    static flags = {
        host: Flags.string({
            description: 'Documented host adapter.',
            options: [...sessionHosts],
            required: true,
        }),
        file: Flags.string({
            description: 'Standalone JSON configuration to compare exactly.',
            required: true,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(HookVerifyCommand);
        const result = new HookVerificationService().verifyHook(
            flags.file,
            flags.host as SessionHost,
        );
        this.log(JSON.stringify(result));
        if (!result.matches) this.exit(1);
    }
}
