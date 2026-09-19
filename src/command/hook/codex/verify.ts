// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { HookVerificationService } from '../../../service/HookVerificationService.ts';

export default class HookVerifyCommand extends Command {
    static description =
        'Compare a file with the supported Codex adapter; never execute or enable hooks.';
    static flags = {
        file: Flags.string({ description: 'Hook JSON file to compare.', required: true }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(HookVerifyCommand);
        const result = new HookVerificationService().verifyHook(flags.file);
        this.log(JSON.stringify(result));

        if (!result.matches) this.exit(1);
    }
}
